import { beforeEach, describe, expect, it, vi } from "vitest";

const { release } = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
}));

vi.mock("../release-booking-slot-after-payment-failure", () => ({
  releaseBookingSlotAfterPaymentFailure: (...args: unknown[]) => release(...args),
}));

vi.mock("@/lib/loyalty/record-redemption", () => ({
  recordLoyaltyRedemption: vi.fn(async () => ({ recorded: false, reason: "insufficient_balance" })),
}));

vi.mock("@/lib/bookings/group-booking", () => ({
  createGroupBooking: vi.fn(async () => {
    throw new Error("group down");
  }),
}));

import { createBookingRecord, releasedBookingIdFromResponse } from "../create-booking-record";

function adminClient() {
  let decrements = 0;
  return {
    rpc: vi.fn(async (name: string) => {
      if (name === "create_booking_with_locking") return { data: "booking-1", error: null };
      if (name === "decrement_product_stock") {
        decrements += 1;
        if (decrements > 1) return { data: null, error: { message: "out of stock" } };
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }),
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.update = self;
      chain.eq = self;
      chain.select = self;
      chain.insert = () => {
        if (table === "booking_addons") {
          return Promise.resolve({ error: { message: "addon down" } });
        }
        return {
          select: async () => ({
            data:
              table === "booking_products"
                ? [
                    { id: "line-1", product_id: "shampoo", product_variant_id: null },
                    { id: "line-2", product_id: "oil", product_variant_id: null },
                  ]
                : [],
            error: null,
          }),
        };
      };
      chain.single = async () => ({
        data: { id: "booking-1", customer_id: "cust-1" },
        error: null,
      });
      chain.maybeSingle = async () => ({
        data: { customer_package_entitlement_id: null },
        error: null,
      });
      return chain;
    },
  };
}

describe("createBookingRecord stock failure", () => {
  beforeEach(() => {
    release.mockClear();
  });

  it("releases the visit when a later product cannot be taken", async () => {
    const admin = adminClient();
    const v = {
      customerId: "cust-1",
      appointmentStatus: "pending",
      subtotal: 100,
      packageDiscountAmount: 0,
      loyaltyDiscountAmount: 0,
      loyaltyPointsRedeemed: 0,
      travelFee: 0,
      serviceFeeConfigId: null,
      serviceFeePercentage: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      taxAmount: 0,
      taxRate: 0,
      providerVat: { inclusive: true, registered: false, ratePercent: 0, vatNumber: null, source: "none" },
      promoCode: null,
      promoDiscountAmount: 0,
      membershipDiscountAmount: 0,
      totalAmount: 100,
      currency: "ZAR",
      promotionId: null,
      membershipPlanId: null,
      allResourceIds: [],
      bookingServicesData: [],
      selectedDatetime: new Date("2026-11-13T10:00:00.000Z"),
      bookingEnd: new Date("2026-11-13T11:00:00.000Z"),
      productById: new Map([
        ["shampoo", { track_stock_quantity: true }],
        ["oil", { track_stock_quantity: true }],
      ]),
    };

    await expect(
      createBookingRecord(
        admin as never,
        admin as never,
        {
          provider_id: "prov-1",
          location_type: "at_salon",
          selected_datetime: "2026-11-13T10:00:00.000Z",
          services: [{ offering_id: "cut" }],
          products: [
            { productId: "shampoo", quantity: 1, unitPrice: 40, totalPrice: 40 },
            { productId: "oil", quantity: 1, unitPrice: 60, totalPrice: 60 },
          ],
        } as never,
        {} as never,
        v as never,
        "cust-1",
      ),
    ).rejects.toMatchObject({ message: "out of stock" });

    expect(release).toHaveBeenCalledWith(
      admin,
      "booking-1",
      "cust-1",
      "Product stock could not be taken — the time was released so you can try again",
    );
  });

  it("keeps the borrowed session on the original visit when product stock cannot be taken", async () => {
    const admin = adminClient();
    const v = {
      customerId: "cust-1",
      appointmentStatus: "pending",
      subtotal: 100,
      packageDiscountAmount: 0,
      loyaltyDiscountAmount: 0,
      loyaltyPointsRedeemed: 0,
      travelFee: 0,
      serviceFeeConfigId: null,
      serviceFeePercentage: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      taxAmount: 0,
      taxRate: 0,
      providerVat: { inclusive: true, registered: false, ratePercent: 0, vatNumber: null, source: "none" },
      promoCode: null,
      promoDiscountAmount: 0,
      membershipDiscountAmount: 0,
      totalAmount: 100,
      currency: "ZAR",
      promotionId: null,
      membershipPlanId: null,
      allResourceIds: [],
      bookingServicesData: [],
      selectedDatetime: new Date("2026-11-13T10:00:00.000Z"),
      bookingEnd: new Date("2026-11-13T11:00:00.000Z"),
      productById: new Map([
        ["shampoo", { track_stock_quantity: true }],
        ["oil", { track_stock_quantity: true }],
      ]),
    };

    await expect(
      createBookingRecord(
        admin as never,
        admin as never,
        {
          provider_id: "prov-1",
          location_type: "at_salon",
          selected_datetime: "2026-11-13T10:00:00.000Z",
          services: [{ offering_id: "cut" }],
          products: [
            { productId: "shampoo", quantity: 1, unitPrice: 40, totalPrice: 40 },
            { productId: "oil", quantity: 1, unitPrice: 60, totalPrice: 60 },
          ],
        } as never,
        {
          customer_package_entitlement_id: "ent-1",
          reschedule_booking_id: "booking-old",
        } as never,
        v as never,
        "cust-1",
      ),
    ).rejects.toMatchObject({ message: "out of stock" });

    expect(admin.rpc).toHaveBeenCalledWith("redeem_customer_package_entitlement", {
      p_entitlement_id: "ent-1",
      p_customer_id: "cust-1",
    });
  });

  it("returns a prepaid session once when the group booking cannot be created", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { ...adminClient(), rpc };
    const v = {
      customerId: "cust-1",
      appointmentStatus: "pending",
      subtotal: 100,
      packageDiscountAmount: 0,
      loyaltyDiscountAmount: 0,
      loyaltyPointsRedeemed: 0,
      travelFee: 0,
      serviceFeeConfigId: null,
      serviceFeePercentage: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      taxAmount: 0,
      taxRate: 0,
      providerVat: { inclusive: true, registered: false, ratePercent: 0, vatNumber: null, source: "none" },
      promoCode: null,
      promoDiscountAmount: 0,
      membershipDiscountAmount: 0,
      totalAmount: 100,
      currency: "ZAR",
      promotionId: null,
      membershipPlanId: null,
      allResourceIds: [],
      bookingServicesData: [],
      selectedDatetime: new Date("2026-11-13T10:00:00.000Z"),
      bookingEnd: new Date("2026-11-13T11:00:00.000Z"),
      productById: new Map(),
      isGroupBooking: true,
      groupParticipants: [{ name: "Guest", service_ids: [] }],
      offeringById: new Map(),
    };

    const res = await createBookingRecord(
      admin as never,
      admin as never,
      {
        provider_id: "prov-1",
        location_type: "at_salon",
        selected_datetime: "2026-11-13T10:00:00.000Z",
        services: [{ offering_id: "cut" }],
      } as never,
      { customer_package_entitlement_id: "ent-1" } as never,
      v as never,
      "cust-1",
    );

    expect(release).toHaveBeenCalledWith(admin, "booking-1", "cust-1");
    expect(rpc).not.toHaveBeenCalledWith(
      "restore_customer_package_entitlement",
      expect.anything(),
    );
    expect((res as Response).status).toBe(500);
  });

  it("releases the time and keeps the borrowed session when an add-on cannot be saved", async () => {
    const admin = adminClient();
    const v = {
      customerId: "cust-1",
      appointmentStatus: "pending",
      subtotal: 100,
      packageDiscountAmount: 0,
      loyaltyDiscountAmount: 0,
      loyaltyPointsRedeemed: 0,
      travelFee: 0,
      serviceFeeConfigId: null,
      serviceFeePercentage: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      taxAmount: 0,
      taxRate: 0,
      providerVat: { inclusive: true, registered: false, ratePercent: 0, vatNumber: null, source: "none" },
      promoCode: null,
      promoDiscountAmount: 0,
      membershipDiscountAmount: 0,
      totalAmount: 100,
      currency: "ZAR",
      promotionId: null,
      membershipPlanId: null,
      allResourceIds: [],
      bookingServicesData: [],
      selectedDatetime: new Date("2026-11-13T10:00:00.000Z"),
      bookingEnd: new Date("2026-11-13T11:00:00.000Z"),
      productById: new Map(),
      addonById: new Map([["addon-1", { price: 20 }]]),
    };

    await expect(
      createBookingRecord(
        admin as never,
        admin as never,
        {
          provider_id: "prov-1",
          location_type: "at_salon",
          selected_datetime: "2026-11-13T10:00:00.000Z",
          services: [{ offering_id: "cut" }],
          addons: ["addon-1"],
        } as never,
        {
          customer_package_entitlement_id: "ent-1",
          reschedule_booking_id: "booking-old",
        } as never,
        v as never,
        "cust-1",
      ),
    ).rejects.toMatchObject({ message: "addon down" });

    expect(release).toHaveBeenCalledWith(
      admin,
      "booking-1",
      "cust-1",
      "Add-on could not be saved — the time was released so you can try again",
    );
    expect(admin.rpc).toHaveBeenCalledWith("redeem_customer_package_entitlement", {
      p_entitlement_id: "ent-1",
      p_customer_id: "cust-1",
    });
  });

  it("releases the time when loyalty points cannot be redeemed and leaves the borrowed session for the caller", async () => {
    const admin = adminClient();
    const v = {
      customerId: "cust-1",
      appointmentStatus: "pending",
      subtotal: 100,
      packageDiscountAmount: 0,
      loyaltyDiscountAmount: 10,
      loyaltyPointsRedeemed: 100,
      travelFee: 0,
      serviceFeeConfigId: null,
      serviceFeePercentage: 0,
      serviceFeeAmount: 0,
      tipAmount: 0,
      taxAmount: 0,
      taxRate: 0,
      providerVat: { inclusive: true, registered: false, ratePercent: 0, vatNumber: null, source: "none" },
      promoCode: null,
      promoDiscountAmount: 0,
      membershipDiscountAmount: 0,
      totalAmount: 90,
      currency: "ZAR",
      promotionId: null,
      membershipPlanId: null,
      allResourceIds: [],
      bookingServicesData: [],
      selectedDatetime: new Date("2026-11-13T10:00:00.000Z"),
      bookingEnd: new Date("2026-11-13T11:00:00.000Z"),
      productById: new Map(),
    };

    const res = await createBookingRecord(
      admin as never,
      admin as never,
      {
        provider_id: "prov-1",
        location_type: "at_salon",
        selected_datetime: "2026-11-13T10:00:00.000Z",
        services: [{ offering_id: "cut" }],
      } as never,
      {
        customer_package_entitlement_id: "ent-1",
        reschedule_booking_id: "booking-old",
      } as never,
      v as never,
      "cust-1",
    );

    expect(release).toHaveBeenCalledWith(admin, "booking-1", "cust-1", "Loyalty points could not be redeemed");
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "redeem_customer_package_entitlement",
      expect.anything(),
    );
    expect((res as Response).status).toBe(400);
    expect(releasedBookingIdFromResponse(res as Response)).toBe("booking-1");
  });
});
