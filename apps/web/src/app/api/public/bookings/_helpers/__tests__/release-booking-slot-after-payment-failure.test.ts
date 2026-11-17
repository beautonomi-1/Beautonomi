import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bookings/deduct-booking-retail-stock", () => ({
  restoreBookingRetailStock: vi.fn(async () => [
    { id: "line-1", productId: "shampoo", variantId: null, quantity: 1 },
  ]),
  lineUpBookingStockWithSavedStatus: vi.fn(async () => undefined),
}));
vi.mock("@/lib/loyalty/refund-redeemed-points", () => ({
  refundRedeemedLoyaltyPoints: vi.fn(async () => undefined),
}));
vi.mock("@/lib/loyalty/claw-back-earned-for-booking", () => ({
  clawBackEarnedLoyaltyForBooking: vi.fn(async () => false),
}));
vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: vi.fn(async () => "tenant-1"),
}));

const booking = {
  id: "booking-1",
  wallet_amount: 0,
  gift_card_amount: 0,
  currency: "ZAR",
  tenant_id: "tenant-1",
  provider_id: "prov-1",
  customer_package_entitlement_id: null,
};

function supabaseFor(options?: { cancelError?: string }) {
  const bookingUpdates: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.delete = self;
      chain.update = (payload: Record<string, unknown>) => {
        if (table === "bookings" && payload.status === "cancelled") bookingUpdates.push(payload);
        return chain;
      };
      chain.maybeSingle = async () => ({ data: booking, error: null });
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve(
          options?.cancelError
            ? { data: null, error: { message: options.cancelError } }
            : { data: [{ id: "booking-1" }], error: null },
        );
      return chain;
    },
    rpc: vi.fn(async () => ({ data: true, error: null })),
  };
  return { client, bookingUpdates };
}

describe("releaseBookingSlotAfterPaymentFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps VAT inside the total when tax inclusion was not stored", async () => {
    const { computeVat } = await import("@beautonomi/utils");
    const { billAfterLoyaltyReturned } = await import("../release-booking-slot-after-payment-failure");
    const bill = billAfterLoyaltyReturned(
      {
        loyalty_discount_amount: 10,
        total_amount: 100,
        tax_amount: 13.04,
        tax_rate: 15,
        tax_inclusive: null,
        tip_amount: 0,
        service_fee_amount: 0,
        platform_fee_amount: 0,
      },
      "ZAR",
    );
    expect(bill).toEqual({
      total_amount: 110,
      tax_amount: computeVat({ baseAmount: 110, ratePercent: 15, inclusive: true, currency: "ZAR" }).taxAmount,
      platform_fee_amount: 0,
      service_fee_amount: 0,
    });
  });

  it("recalculates the service fee from the restored total", async () => {
    const { billAfterLoyaltyReturned } = await import("../release-booking-slot-after-payment-failure");
    const bill = billAfterLoyaltyReturned(
      {
        loyalty_discount_amount: 10,
        total_amount: 110,
        tax_amount: 0,
        tax_rate: 0,
        tax_inclusive: null,
        tip_amount: 0,
        service_fee_amount: 10,
        platform_fee_amount: 10,
        service_fee_percentage: 10,
      },
      "ZAR",
    );
    expect(bill).toEqual({
      total_amount: 121,
      tax_amount: 0,
      platform_fee_amount: 11,
      service_fee_amount: 11,
    });
  });

  it("puts the products back before the visit is cancelled", async () => {
    const { restoreBookingRetailStock } = await import("@/lib/bookings/deduct-booking-retail-stock");
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const { client, bookingUpdates } = supabaseFor();

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(restoreBookingRetailStock).toHaveBeenCalledWith(client, "booking-1");
    expect(bookingUpdates).toEqual([
      expect.objectContaining({ status: "cancelled" }),
    ]);
  });

  it("puts the products back on the visit when the cancel is not saved", async () => {
    const { lineUpBookingStockWithSavedStatus } = await import(
      "@/lib/bookings/deduct-booking-retail-stock"
    );
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const { client } = supabaseFor({ cancelError: "down" });

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(lineUpBookingStockWithSavedStatus).toHaveBeenCalledWith(
      client,
      "booking-1",
      [],
      [{ id: "line-1", productId: "shampoo", variantId: null, quantity: 1 }],
    );
  });

  it("clears the wallet amount when the money is back and the cancel is not saved", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, status: "pending_payment", wallet_amount: 40 },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(updates).toContainEqual({ wallet_amount: 0 });
  });

  it("clears the gift card when it was returned and the cancel is not saved", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: {
            ...booking,
            status: "pending_payment",
            gift_card_amount: 25,
            gift_card_id: "gift-1",
          },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(updates).toContainEqual({ gift_card_id: null, gift_card_amount: 0 });
  });

  it("clears the loyalty discount when the points are back and the cancel is not saved", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: {
            ...booking,
            status: "pending_payment",
            loyalty_points_used: 100,
            loyalty_discount_amount: 10,
            total_amount: 90,
            tax_amount: 0,
            tax_rate: 0,
            tip_amount: 0,
            platform_fee_amount: 0,
            currency: "ZAR",
          },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(updates).toContainEqual({
      loyalty_points_used: 0,
      loyalty_points_redeemed: 0,
      loyalty_discount_amount: 0,
      total_amount: 100,
      tax_amount: 0,
      platform_fee_amount: 0,
      service_fee_amount: 0,
    });
  });

  it("puts the loyalty discount and its tax back on the bill when the cancel is not saved", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: {
            ...booking,
            status: "pending_payment",
            loyalty_points_used: 100,
            loyalty_discount_amount: 10,
            total_amount: 115,
            tax_amount: 15,
            tax_rate: 15,
            tax_inclusive: false,
            tip_amount: 0,
            platform_fee_amount: 0,
            currency: "ZAR",
          },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(updates).toContainEqual(
      expect.objectContaining({
        loyalty_discount_amount: 0,
        total_amount: 126.5,
        tax_amount: 16.5,
      }),
    );
  });

  it("puts the unsaved loyalty discount back on the bill when the points are returned and the cancel is not saved", async () => {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    vi.mocked(refundRedeemedLoyaltyPoints).mockResolvedValueOnce({
      refunded: true,
      points: 100,
    });
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        let selected = "";
        chain.select = (cols: string) => {
          selected = cols;
          return chain;
        };
        chain.eq = self;
        chain.order = self;
        chain.limit = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => {
          if (selected.includes("redemption_rate")) {
            return { data: { redemption_rate: 10 }, error: null };
          }
          return {
            data: {
              ...booking,
              status: "pending_payment",
              loyalty_discount_amount: 0,
              discount_amount: 25,
              total_amount: 90,
              tax_amount: 0,
              tax_rate: 0,
              tip_amount: 0,
              platform_fee_amount: 0,
              currency: "ZAR",
            },
            error: null,
          };
        };
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(updates).toContainEqual(
      expect.objectContaining({
        loyalty_discount_amount: 0,
        discount_amount: 15,
        total_amount: 100,
      }),
    );
  });

  it("puts the loyalty discount back on the cancelled visit when the points are back", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: {
            ...booking,
            status: "pending_payment",
            loyalty_points_used: 100,
            loyalty_discount_amount: 10,
            total_amount: 90,
            tax_amount: 0,
            tax_rate: 0,
            tip_amount: 0,
            platform_fee_amount: 0,
            currency: "ZAR",
          },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: [{ id: "booking-1" }], error: null });
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(true);
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "cancelled",
        loyalty_discount_amount: 0,
        total_amount: 100,
      }),
    );
  });

  it("keeps the loyalty discount when the points are not back and the cancel is not saved", async () => {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    vi.mocked(refundRedeemedLoyaltyPoints).mockResolvedValueOnce({
      refunded: false,
      points: 0,
      reason: "rpc_error",
    });
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: {
            ...booking,
            status: "pending_payment",
            loyalty_points_used: 100,
            loyalty_discount_amount: 10,
          },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(updates.some((row) => row.loyalty_discount_amount === 0)).toBe(false);
  });

  it("puts the prepaid session back on the visit when the cancel is not saved", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.is = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, status: "pending_payment", customer_package_entitlement_id: "ent-1" },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(updates).toContainEqual({ customer_package_entitlement_id: "ent-1" });
    expect(client.rpc).toHaveBeenCalledWith("redeem_customer_package_entitlement", {
      p_entitlement_id: "ent-1",
      p_customer_id: "cust-1",
    });
  });

  it("leaves the prepaid session free when it cannot be held on the open visit", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.is = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, status: "pending_payment", customer_package_entitlement_id: "ent-1" },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async (fn: string) => {
        if (fn === "redeem_customer_package_entitlement") {
          return { data: null, error: { message: "down" } };
        }
        return { data: true, error: null };
      }),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(updates).toContainEqual({ customer_package_entitlement_id: "ent-1" });
    expect(updates.at(-1)).toEqual({ customer_package_entitlement_id: null });
  });

  it("leaves the prepaid session free when the hold reports that no session was taken", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.is = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, status: "pending_payment", customer_package_entitlement_id: "ent-1" },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve(
            payload.status === "cancelled"
              ? { data: null, error: { message: "down" } }
              : { data: [{ id: "booking-1" }], error: null },
          );
        return chain;
      },
      rpc: vi.fn(async (fn: string) => {
        if (fn === "redeem_customer_package_entitlement") return { data: false, error: null };
        return { data: true, error: null };
      }),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(updates).toContainEqual({ customer_package_entitlement_id: "ent-1" });
    expect(updates.at(-1)).toEqual({ customer_package_entitlement_id: null });
  });

  it("does not cancel the visit when the products cannot be put back", async () => {
    const { restoreBookingRetailStock } = await import("@/lib/bookings/deduct-booking-retail-stock");
    vi.mocked(restoreBookingRetailStock).mockRejectedValueOnce(new Error("stock down"));
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const { client, bookingUpdates } = supabaseFor();

    await expect(
      releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1"),
    ).rejects.toThrow("stock down");
    expect(bookingUpdates).toEqual([]);
  });

  it("stores the reason it was given", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const { client, bookingUpdates } = supabaseFor();

    await releaseBookingSlotAfterPaymentFailure(
      client as never,
      "booking-1",
      "cust-1",
      "Product stock could not be taken — the time was released so you can try again",
    );

    expect(bookingUpdates[0]).toMatchObject({
      status: "cancelled",
      cancellation_reason: "Product stock could not be taken — the time was released so you can try again",
    });
  });

  it("puts the prepaid session back on the visit when the return fails", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.is = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, customer_package_entitlement_id: "ent-1" },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data:
              payload.status === "cancelled" || payload.customer_package_entitlement_id === null
                ? [{ id: "booking-1" }]
                : [],
            error: null,
          });
        return chain;
      },
      rpc: vi.fn(async (fn: string) => {
        if (fn === "restore_customer_package_entitlement") {
          return { data: null, error: { message: "down" } };
        }
        return { data: true, error: null };
      }),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(client.rpc).toHaveBeenCalledWith("restore_customer_package_entitlement", {
      p_entitlement_id: "ent-1",
      p_customer_id: "cust-1",
    });
    expect(updates).toContainEqual({ customer_package_entitlement_id: "ent-1" });
    const cancel = updates.find((row) => row.status === "cancelled");
    expect(cancel).toMatchObject({ status: "cancelled" });
    expect(cancel).not.toHaveProperty("customer_package_entitlement_id");
  });

  it("keeps the prepaid session on the visit when the return reports that nothing was given back", async () => {
    const { releaseBookingSlotAfterPaymentFailure } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        let payload: Record<string, unknown> = {};
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.is = self;
        chain.update = (next: Record<string, unknown>) => {
          payload = next;
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, customer_package_entitlement_id: "ent-1" },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data:
              payload.status === "cancelled" || payload.customer_package_entitlement_id === null
                ? [{ id: "booking-1" }]
                : [],
            error: null,
          });
        return chain;
      },
      rpc: vi.fn(async () => ({ data: false, error: null })),
    };

    await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(updates).toContainEqual({ customer_package_entitlement_id: "ent-1" });
    const cancel = updates.find((row) => row.status === "cancelled");
    expect(cancel).not.toHaveProperty("customer_package_entitlement_id");
  });

  it("keeps the wallet amount when the refund does not finish", async () => {
    const { releaseBookingSlotAfterPaymentFailure, PAYMENT_FAILURE_REFUND_STILL_DUE } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const deleted: string[] = [];
    const client = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.delete = () => {
          deleted.push(table);
          return chain;
        };
        chain.update = (payload: Record<string, unknown>) => {
          if (payload.status === "cancelled") updates.push(payload);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: { ...booking, wallet_amount: 40 },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: [{ id: "booking-1" }], error: null });
        return chain;
      },
      rpc: vi.fn(async (fn: string) => {
        if (fn === "wallet_credit_admin") return { data: null, error: { message: "down" } };
        return { data: true, error: null };
      }),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(updates[0]).toMatchObject({ status: "cancelled" });
    expect(updates[0]).not.toHaveProperty("wallet_amount");
    expect(deleted).not.toContain("finance_transactions");
    expect(String(updates[0]?.cancellation_reason)).toContain(PAYMENT_FAILURE_REFUND_STILL_DUE);
  });

  it("keeps the visit marked when the loyalty return does not finish", async () => {
    const { refundRedeemedLoyaltyPoints } = await import("@/lib/loyalty/refund-redeemed-points");
    vi.mocked(refundRedeemedLoyaltyPoints).mockResolvedValueOnce({
      refunded: false,
      points: 0,
      reason: "rpc_error",
    });
    const { releaseBookingSlotAfterPaymentFailure, PAYMENT_FAILURE_REFUND_STILL_DUE } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const { client, bookingUpdates } = supabaseFor();

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(String(bookingUpdates[0]?.cancellation_reason)).toContain(PAYMENT_FAILURE_REFUND_STILL_DUE);
  });

  it("puts the loyalty discount back when the spent points are back and the earned points are not", async () => {
    const { clawBackEarnedLoyaltyForBooking } = await import(
      "@/lib/loyalty/claw-back-earned-for-booking"
    );
    vi.mocked(clawBackEarnedLoyaltyForBooking).mockRejectedValueOnce(new Error("ledger down"));
    const { releaseBookingSlotAfterPaymentFailure, PAYMENT_FAILURE_REFUND_STILL_DUE } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const updates: Record<string, unknown>[] = [];
    const client = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.delete = self;
        chain.update = (next: Record<string, unknown>) => {
          updates.push(next);
          return chain;
        };
        chain.maybeSingle = async () => ({
          data: {
            ...booking,
            status: "pending_payment",
            loyalty_points_used: 100,
            loyalty_points_earned: 20,
            loyalty_discount_amount: 10,
            total_amount: 90,
            tax_amount: 0,
            tax_rate: 0,
            tip_amount: 0,
            platform_fee_amount: 0,
            currency: "ZAR",
          },
          error: null,
        });
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: [{ id: "booking-1" }], error: null });
        return chain;
      },
      rpc: vi.fn(async () => ({ data: true, error: null })),
    };

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");
    const cancel = updates.find((row) => row.status === "cancelled");

    expect(finished).toBe(false);
    expect(String(cancel?.cancellation_reason)).toContain(PAYMENT_FAILURE_REFUND_STILL_DUE);
    expect(cancel).toMatchObject({ loyalty_discount_amount: 0, total_amount: 100 });
    expect(cancel).not.toHaveProperty("loyalty_points_earned");
  });

  it("keeps the visit marked when earned points cannot be taken back", async () => {
    const { clawBackEarnedLoyaltyForBooking } = await import(
      "@/lib/loyalty/claw-back-earned-for-booking"
    );
    vi.mocked(clawBackEarnedLoyaltyForBooking).mockRejectedValueOnce(new Error("ledger down"));
    const { releaseBookingSlotAfterPaymentFailure, PAYMENT_FAILURE_REFUND_STILL_DUE } = await import(
      "../release-booking-slot-after-payment-failure"
    );
    const { client, bookingUpdates } = supabaseFor();

    const finished = await releaseBookingSlotAfterPaymentFailure(client as never, "booking-1", "cust-1");

    expect(finished).toBe(false);
    expect(String(bookingUpdates[0]?.cancellation_reason)).toContain(PAYMENT_FAILURE_REFUND_STILL_DUE);
  });
});
