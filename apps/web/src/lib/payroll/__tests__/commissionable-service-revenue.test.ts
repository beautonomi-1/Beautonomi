import { describe, expect, it } from "vitest";
import {
  commissionableServiceRevenue,
  paidAppointmentProductAmount,
  paidAppointmentLineShares,
  serviceAmountAfterBillSplit,
  addonLinePrice,
  addonRemovedFromServicePool,
  addonShareForStaff,
  appointmentProductShareForStaff,
  appointmentProductPayAndStoredShare,
  addonPayAndStoredShare,
  bookingEarnsCommission,
  paidBookingIds,
  netBookingRevenueAfterRefunds,
  walkInRealizedLineAmount,
  saleLineKeptAmounts,
  walkInLineInPeriod,
  posSaleLineInPeriod,
  posServiceCommissionAmount,
  posSaleTipInPeriod,
  ledgerServiceCommissionExcludingRetail,
  storedServiceCommissionKeepingEachVisit,
  serviceRevenueAfterRetail,
  splitProductCommissionLine,
} from "../commission-calculator";
import { planCancellationFeeShareLines, commissionLeftAfterFeeShare, feeShareReplacesStoredCommission } from "../cancellation-fee-share";

describe("commissionableServiceRevenue", () => {
  it("leaves a service with commission turned off out of the tier base", () => {
    const revenue = commissionableServiceRevenue({
      bookingRevenue: 1000,
      totalServicePrice: 1000,
      staffServices: [
        { price: 600, commissionEnabled: true },
        { price: 400, commissionEnabled: false },
      ],
    });
    expect(revenue).toBe(600);
  });

  it("counts the full share when every service can earn commission", () => {
    const revenue = commissionableServiceRevenue({
      bookingRevenue: 800,
      totalServicePrice: 800,
      staffServices: [
        { price: 500, commissionEnabled: true },
        { price: 300, commissionEnabled: true },
      ],
    });
    expect(revenue).toBe(800);
  });
});

describe("serviceRevenueAfterRetail", () => {
  it("does not commission a product again inside the service amount", () => {
    expect(serviceRevenueAfterRetail(1000, 200)).toBe(800);
    expect(serviceRevenueAfterRetail(1000, 0)).toBe(1000);
    expect(ledgerServiceCommissionExcludingRetail(400, 800, 200)).toBe(320);
    expect(ledgerServiceCommissionExcludingRetail(-70, 600, 100)).toBe(-60);
  });

  it("keeps each visit at the rate saved when that client paid", () => {
    expect(
      storedServiceCommissionKeepingEachVisit({
        storedByBooking: { friday: 40, saturday: 70 },
        clawbackByBooking: { saturday: -70 },
        visits: [
          { bookingId: "friday", keptRevenue: 100, excludedRevenue: 100, ownRateAddonCommission: 0 },
          { bookingId: "saturday", keptRevenue: 600, excludedRevenue: 100, ownRateAddonCommission: 0 },
        ],
      }),
    ).toBe(20);
  });

  it("pays an add-on on a complimentary service when nothing was saved for that visit", () => {
    expect(
      storedServiceCommissionKeepingEachVisit({
        storedByBooking: { monday: 100 },
        visits: [
          {
            bookingId: "friday",
            keptRevenue: 80,
            excludedRevenue: 0,
            ownRateAddonCommission: 0,
            calculatedCommission: 32,
          },
        ],
      }),
    ).toBe(32);
  });

  it("pays a scoped add-on at the saved service rate and takes it off the other stylist", () => {
    expect(
      storedServiceCommissionKeepingEachVisit({
        storedByBooking: { saturday: 264 },
        visits: [
          {
            bookingId: "saturday",
            keptRevenue: 600,
            excludedRevenue: 60,
            ownRateAddonCommission: 0,
            serviceRateAddonPay: 100,
          },
        ],
      }),
    ).toBe(280);
    expect(
      storedServiceCommissionKeepingEachVisit({
        storedByBooking: { saturday: 176 },
        visits: [
          {
            bookingId: "saturday",
            keptRevenue: 400,
            excludedRevenue: 40,
            ownRateAddonCommission: 0,
            serviceRateAddonPay: 0,
          },
        ],
      }),
    ).toBe(160);
  });
});

describe("paidAppointmentProductAmount", () => {
  it("does not pay product commission before the appointment is paid", () => {
    expect(paidAppointmentProductAmount(180, 0)).toBe(0);
    expect(paidAppointmentProductAmount(180, 150)).toBe(180);
    expect(
      paidAppointmentProductAmount(180, 800, { subtotal: 1000, discounts: 200 }),
    ).toBe(144);
    expect(
      paidAppointmentProductAmount(180, 150, { subtotal: 1000, discounts: 200 }),
    ).toBe(27);
  });

  it("makes three products on one bill add up to what was paid", () => {
    const shares = paidAppointmentLineShares({
      lines: [
        { id: "alex", price: 100 },
        { id: "jo", price: 100 },
        { id: "sam", price: 100 },
      ],
      bookingPaidAmount: 299,
      bill: { subtotal: 300, discounts: 1 },
    });
    expect((shares.get("alex") ?? 0) + (shares.get("jo") ?? 0) + (shares.get("sam") ?? 0)).toBe(299);
    expect(shares.get("alex")).toBe(99.67);
    expect(shares.get("jo")).toBe(99.67);
    expect(shares.get("sam")).toBe(99.66);
  });

  it("keeps each stylist's service share from that same bill", () => {
    const services = [
      { id: "alex", price: 100, billShare: 99.66 },
      { id: "sam", price: 100, billShare: 99.67 },
    ];
    expect(serviceAmountAfterBillSplit({ pool: 199.33, services, serviceId: "alex" })).toBe(99.66);
    expect(serviceAmountAfterBillSplit({ pool: 199.33, services, serviceId: "sam" })).toBe(99.67);
    expect(serviceAmountAfterBillSplit({ pool: 209.33, services, serviceId: "alex" })).toBe(104.66);
    expect(serviceAmountAfterBillSplit({ pool: 209.33, services, serviceId: "sam" })).toBe(104.67);
  });
});

describe("splitProductCommissionLine", () => {
  it("pays a product's own percentage and keeps it off the tier", () => {
    expect(
      splitProductCommissionLine({
        amount: 200,
        commissionEnabled: true,
        staffCommissionEnabled: true,
        overrideRate: 15,
        baseRate: 10,
      }),
    ).toEqual({ revenue: 200, tierRevenue: 0, overrideCommission: 30, commission: 30 });
  });

  it("leaves a product with commission turned off out of the pay run", () => {
    expect(
      splitProductCommissionLine({
        amount: 200,
        commissionEnabled: false,
        staffCommissionEnabled: true,
        overrideRate: 15,
        baseRate: 10,
      }),
    ).toEqual({ revenue: 0, tierRevenue: 0, overrideCommission: 0, commission: 0 });
  });
});

describe("appointmentProductShareForStaff", () => {
  const services = [
    { staffId: "alex", price: 600 },
    { staffId: "sam", price: 400 },
  ];

  it("shares an unassigned product by each stylist's service price", () => {
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "alex",
        services,
      }),
    ).toBe(60);
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "sam",
        services,
      }),
    ).toBe(40);
  });

  it("makes three stylists' product shares add up to the product", () => {
    const three = [
      { staffId: "alex", price: 100 },
      { staffId: "sam", price: 100 },
      { staffId: "jo", price: 100 },
    ];
    const alex = appointmentProductShareForStaff({ paidAmount: 200, staffId: "alex", services: three });
    const sam = appointmentProductShareForStaff({ paidAmount: 200, staffId: "sam", services: three });
    const jo = appointmentProductShareForStaff({ paidAmount: 200, staffId: "jo", services: three });
    expect(alex + sam + jo).toBe(200);
    expect(alex).toBe(66.67);
    expect(jo).toBe(66.67);
    expect(sam).toBe(66.66);
  });

  it("pays a product on a complimentary service to the stylist who did it", () => {
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "alex",
        services: [{ staffId: "alex", price: 0 }],
      }),
    ).toBe(100);
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "alex",
        services: [
          { staffId: "alex", price: 0 },
          { staffId: "sam", price: 0 },
        ],
      }),
    ).toBe(50);
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "sam",
        services: [
          { staffId: "alex", price: 0 },
          { staffId: "sam", price: 0 },
        ],
      }),
    ).toBe(50);
  });

  it("pays an assigned product only to the named stylist", () => {
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "alex",
        productStaffId: "sam",
        services,
      }),
    ).toBe(0);
    expect(
      appointmentProductShareForStaff({
        paidAmount: 100,
        staffId: "sam",
        productStaffId: "sam",
        services,
      }),
    ).toBe(100);
  });

  it("leaves the named product inside each stylist's saved service line by service price", () => {
    expect(
      appointmentProductPayAndStoredShare({
        paidAmount: 100,
        staffId: "alex",
        productStaffId: "sam",
        services,
      }),
    ).toEqual({ pay: 0, inStoredService: 60 });
    expect(
      appointmentProductPayAndStoredShare({
        paidAmount: 100,
        staffId: "sam",
        productStaffId: "sam",
        services,
      }),
    ).toEqual({ pay: 100, inStoredService: 40 });
  });
});

describe("addonShareForStaff", () => {
  it("pays the add-on to the stylist whose service it belongs to", () => {
    const services = [
      { offeringId: "cut", staffId: "stylist-a", price: 400 },
      { offeringId: "colour", staffId: "stylist-b", price: 400 },
    ];
    expect(
      addonShareForStaff({
        paidAmount: 100,
        staffId: "stylist-a",
        services,
        applicableServiceIds: ["cut"],
      }),
    ).toBe(100);
    expect(
      addonShareForStaff({
        paidAmount: 100,
        staffId: "stylist-b",
        services,
        applicableServiceIds: ["cut"],
      }),
    ).toBe(0);
  });

  it("matches an add-on scoped to the catalogue service, and does not pay a stylist it does not belong to", () => {
    const services = [
      { offeringId: "salon-cut", masterServiceId: "catalogue-cut", staffId: "stylist-a", price: 400 },
      { offeringId: "salon-colour", masterServiceId: "catalogue-colour", staffId: "stylist-b", price: 400 },
    ];
    expect(
      addonShareForStaff({
        paidAmount: 100,
        staffId: "stylist-a",
        services,
        applicableServiceIds: ["catalogue-cut"],
      }),
    ).toBe(100);
    expect(
      addonShareForStaff({
        paidAmount: 100,
        staffId: "stylist-b",
        services,
        applicableServiceIds: ["catalogue-cut"],
      }),
    ).toBe(0);
  });

  it("pays an add-on on a complimentary service to that stylist", () => {
    expect(
      addonShareForStaff({
        paidAmount: 80,
        staffId: "stylist-a",
        services: [
          { offeringId: "cut", staffId: "stylist-a", price: 0 },
          { offeringId: "colour", staffId: "stylist-b", price: 400 },
        ],
        applicableServiceIds: ["cut"],
      }),
    ).toBe(80);
    expect(
      addonShareForStaff({
        paidAmount: 80,
        staffId: "stylist-a",
        services: [
          { offeringId: "cut", staffId: "stylist-a", price: 0 },
          { offeringId: "gloss", staffId: "stylist-b", price: 0 },
        ],
      }),
    ).toBe(40);
  });

  it("leaves a scoped add-on inside each stylist's saved service line by service price", () => {
    const priced = [
      { offeringId: "cut", staffId: "alex", price: 600 },
      { offeringId: "colour", staffId: "sam", price: 400 },
    ];
    expect(
      addonPayAndStoredShare({
        paidAmount: 100,
        staffId: "alex",
        services: priced,
        applicableServiceIds: ["cut"],
      }),
    ).toEqual({ pay: 100, inStoredService: 60 });
    expect(
      addonPayAndStoredShare({
        paidAmount: 100,
        staffId: "sam",
        services: priced,
        applicableServiceIds: ["cut"],
      }),
    ).toEqual({ pay: 0, inStoredService: 40 });
  });
});

describe("addonRemovedFromServicePool", () => {
  it("pays the stylist on the appointment when the add-on's service has nobody assigned", () => {
    const services = [
      { offeringId: "cut", staffId: null, price: 400 },
      { offeringId: "colour", staffId: "stylist-b", price: 400 },
    ];
    expect(
      addonShareForStaff({
        paidAmount: 100,
        staffId: "stylist-b",
        services,
        applicableServiceIds: ["cut"],
      }),
    ).toBe(100);
    expect(
      addonRemovedFromServicePool({
        paidAmount: 100,
        commissionEnabled: true,
        services,
        applicableServiceIds: ["not-on-this-appointment"],
      }),
    ).toBe(false);
  });
});

describe("addonLinePrice", () => {
  it("counts every add-on, not only the first", () => {
    expect(addonLinePrice(25, 2)).toBe(50);
  });
});

describe("bookingEarnsCommission", () => {
  it("pays a visit that went ahead and skips a cancellation or no-show", () => {
    expect(bookingEarnsCommission("completed")).toBe(true);
    expect(bookingEarnsCommission("in_progress")).toBe(true);
    expect(bookingEarnsCommission("cancelled")).toBe(false);
    expect(bookingEarnsCommission("no_show")).toBe(false);
  });
});

describe("paidBookingIds", () => {
  it("uses the appointments that were paid in the period", () => {
    const ids = paidBookingIds(
      new Map([
        ["saturday-appointment", 180],
        ["unpaid", 0],
      ]),
    );
    expect(ids).toEqual(["saturday-appointment"]);
  });
});

describe("walkInRealizedLineAmount", () => {
  it("pays what the client kept after a partial return", () => {
    expect(
      walkInRealizedLineAmount({
        lineTotal: 200,
        subtotal: 200,
        discountAmount: 0,
        totalAmount: 200,
        refundedAmount: 50,
      }),
    ).toBe(150);
  });

  it("applies the sale discount before the return", () => {
    expect(
      walkInRealizedLineAmount({
        lineTotal: 200,
        subtotal: 200,
        discountAmount: 40,
        totalAmount: 160,
        refundedAmount: 40,
      }),
    ).toBe(120);
  });

  it("splits a return across every line on the sale", () => {
    expect(
      walkInRealizedLineAmount({
        lineTotal: 100,
        subtotal: 200,
        totalAmount: 200,
        refundedAmount: 50,
      }),
    ).toBe(75);
  });

  it("makes three till lines add up to what the client kept", () => {
    const shares = saleLineKeptAmounts({
      lines: [
        { id: "alex", lineTotal: 100 },
        { id: "jo", lineTotal: 100 },
        { id: "sam", lineTotal: 100 },
      ],
      subtotal: 300,
      totalAmount: 300,
      refundedAmount: 1,
    });
    expect((shares.get("alex") ?? 0) + (shares.get("jo") ?? 0) + (shares.get("sam") ?? 0)).toBe(299);
    expect(shares.get("alex")).toBe(99.67);
    expect(shares.get("jo")).toBe(99.67);
    expect(shares.get("sam")).toBe(99.66);
  });
});

describe("walkInLineInPeriod", () => {
  const period = { periodFrom: new Date("2026-11-01T00:00:00.000Z"), periodTo: new Date("2026-11-30T23:59:59.000Z") };
  const line = { lineTotal: 200, subtotal: 200, totalAmount: 200 };

  it("keeps the sale in the week it was paid and takes a same-week return off", () => {
    expect(
      walkInLineInPeriod({
        ...line,
        refundedAmount: 50,
        paidAt: "2026-11-10T10:00:00.000Z",
        refundedAt: "2026-11-12T10:00:00.000Z",
        ...period,
      }),
    ).toBe(150);
  });

  it("leaves a later return on the week the product is brought back", () => {
    expect(
      walkInLineInPeriod({
        ...line,
        refundedAmount: 50,
        paidAt: "2026-11-10T10:00:00.000Z",
        refundedAt: "2026-12-02T10:00:00.000Z",
        ...period,
      }),
    ).toBe(200);
    expect(
      walkInLineInPeriod({
        ...line,
        refundedAmount: 50,
        paidAt: "2026-11-10T10:00:00.000Z",
        refundedAt: "2026-12-02T10:00:00.000Z",
        periodFrom: new Date("2026-12-01T00:00:00.000Z"),
        periodTo: new Date("2026-12-31T23:59:59.000Z"),
      }),
    ).toBe(-50);
  });
});

describe("posSaleLineInPeriod", () => {
  const november = {
    periodFrom: new Date("2026-11-01T00:00:00.000Z"),
    periodTo: new Date("2026-11-30T23:59:59.000Z"),
  };
  const sale = {
    lineTotal: 200,
    subtotal: 200,
    totalAmount: 200,
    saleDate: "2026-11-10T10:00:00.000Z",
  };

  it("keeps a completed till sale in the month it was paid", () => {
    expect(
      posSaleLineInPeriod({
        ...sale,
        paymentStatus: "completed",
        ...november,
      }),
    ).toBe(200);
  });

  it("keeps a later till refund on the sale month and takes it off the refund month", () => {
    const refunded = {
      ...sale,
      paymentStatus: "refunded",
      updatedAt: "2026-12-02T10:00:00.000Z",
    };
    expect(posSaleLineInPeriod({ ...refunded, ...november })).toBe(200);
    expect(
      posSaleLineInPeriod({
        ...refunded,
        periodFrom: new Date("2026-12-01T00:00:00.000Z"),
        periodTo: new Date("2026-12-31T23:59:59.000Z"),
      }),
    ).toBe(-200);
  });

  it("takes a till refund off the sale month when it happens in that month", () => {
    expect(
      posSaleLineInPeriod({
        ...sale,
        paymentStatus: "refunded",
        updatedAt: "2026-11-12T10:00:00.000Z",
        ...november,
      }),
    ).toBe(0);
  });

  it("leaves a booking payment that was recorded as a till sale to the appointment", () => {
    expect(
      posSaleLineInPeriod({
        ...sale,
        paymentStatus: "completed",
        notes: "Booking BTN-1",
        ...november,
      }),
    ).toBe(0);
  });
});

describe("posServiceCommissionAmount", () => {
  it("pays a till service at the tier this period's sales reached", () => {
    expect(
      posServiceCommissionAmount({
        realizedNet: 200,
        staffPays: true,
        baseRate: 10,
        tierRate: 20,
      }),
    ).toEqual({
      tierRevenue: 200,
      overrideRevenue: 0,
      overrideCommission: 0,
      commission: 40,
      returnCommission: 0,
    });
  });

  it("takes a later till-service refund off at the service rate", () => {
    expect(
      posServiceCommissionAmount({
        realizedNet: -200,
        staffPays: true,
        overrideRate: 15,
        baseRate: 10,
        tierRate: 20,
      }).returnCommission,
    ).toBe(-30);
  });
});

describe("posSaleTipInPeriod", () => {
  const november = {
    periodFrom: new Date("2026-11-01T00:00:00.000Z"),
    periodTo: new Date("2026-11-30T23:59:59.000Z"),
  };

  it("pays the till tip in the month of the sale and takes a later refund off the refund month", () => {
    const sale = {
      notes: "Walk-in\nTip: 50",
      paymentStatus: "refunded",
      saleDate: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-12-02T10:00:00.000Z",
    };
    expect(posSaleTipInPeriod({ ...sale, ...november })).toBe(50);
    expect(
      posSaleTipInPeriod({
        ...sale,
        periodFrom: new Date("2026-12-01T00:00:00.000Z"),
        periodTo: new Date("2026-12-31T23:59:59.000Z"),
      }),
    ).toBe(-50);
  });
});

describe("netBookingRevenueAfterRefunds", () => {
  const collected = new Map([
    ["this-week", 1000],
    ["deposit-only", 200],
  ]);

  it("takes a same-period refund off the amount that is commissioned", () => {
    const netted = netBookingRevenueAfterRefunds(collected, [
      { booking_id: "this-week", net: -400, refund_component: "provider_earnings" },
      { booking_id: "this-week", net: -15, refund_component: "tip" },
      { booking_id: "this-week", net: -20, refund_component: "platform_fee" },
    ]);
    expect(netted.revenueByBooking.get("this-week")).toBe(600);
    expect(netted.bookingsReduced).toEqual(["this-week"]);
  });

  it("leaves a refund that belongs to an earlier period for the clawback line", () => {
    const netted = netBookingRevenueAfterRefunds(collected, [
      { booking_id: "deposit-only", amount: 1000, refund_component: "provider_earnings" },
    ]);
    expect(netted.revenueByBooking.get("deposit-only")).toBe(200);
    expect(netted.bookingsReduced).toEqual([]);
  });

  it("drops a visit that was paid and refunded in the same period", () => {
    const netted = netBookingRevenueAfterRefunds(collected, [
      { booking_id: "this-week", net: -1000, refund_component: "_legacy" },
    ]);
    expect(netted.revenueByBooking.get("this-week")).toBe(0);
    expect(paidBookingIds(netted.revenueByBooking)).not.toContain("this-week");
  });
});

describe("planCancellationFeeShareLines", () => {
  it("pays a no-show fee on a complimentary service to the booked stylist", () => {
    expect(
      planCancellationFeeShareLines(
        [{ staff_id: "alex", price: 0, commission_enabled: true, rate: 40 }],
        200,
      ),
    ).toEqual([{ staff_id: "alex", base_amount: 200, rate: 40, amount: 80 }]);
  });

  it("splits a no-show fee equally when every service is complimentary", () => {
    const lines = planCancellationFeeShareLines(
      [
        { staff_id: "alex", price: 0, commission_enabled: true, rate: 40 },
        { staff_id: "sam", price: 0, commission_enabled: true, rate: 20 },
      ],
      200,
    );
    expect(lines).toEqual([
      { staff_id: "alex", base_amount: 100, rate: 40, amount: 40 },
      { staff_id: "sam", base_amount: 100, rate: 20, amount: 20 },
    ]);
  });

  it("keeps a priced service's share when another service is complimentary", () => {
    expect(
      planCancellationFeeShareLines(
        [
          { staff_id: "alex", price: 600, commission_enabled: true, rate: 10 },
          { staff_id: "sam", price: 0, commission_enabled: true, rate: 40 },
        ],
        200,
      ),
    ).toEqual([{ staff_id: "alex", base_amount: 200, rate: 10, amount: 20 }]);
  });

  it("does not give a complimentary stylist the fee when the priced stylist is not paid commission", () => {
    expect(
      planCancellationFeeShareLines(
        [
          { staff_id: "alex", price: 600, commission_enabled: true, rate: 0 },
          { staff_id: "sam", price: 0, commission_enabled: true, rate: 40 },
        ],
        200,
      ),
    ).toEqual([]);
    expect(
      planCancellationFeeShareLines(
        [
          { staff_id: "alex", price: 600, commission_enabled: false, rate: 40 },
          { staff_id: "sam", price: 400, commission_enabled: true, rate: 40 },
        ],
        200,
      ),
    ).toEqual([{ staff_id: "sam", base_amount: 80, rate: 40, amount: 32 }]);
  });

  it("keeps a complimentary stylist's seat when that stylist is not paid commission", () => {
    expect(
      planCancellationFeeShareLines(
        [
          { staff_id: "alex", price: 0, commission_enabled: false, rate: 40 },
          { staff_id: "sam", price: 0, commission_enabled: true, rate: 40 },
        ],
        200,
      ),
    ).toEqual([{ staff_id: "sam", base_amount: 100, rate: 40, amount: 40 }]);
  });

  it("makes three stylists' shares add up to the fee", () => {
    const lines = planCancellationFeeShareLines(
      [
        { staff_id: "alex", price: 0, commission_enabled: true, rate: 40 },
        { staff_id: "sam", price: 0, commission_enabled: true, rate: 40 },
        { staff_id: "jo", price: 0, commission_enabled: true, rate: 40 },
      ],
      200,
    );
    expect(lines.map((line) => line.base_amount)).toEqual([66.67, 66.66, 66.67]);
    expect(lines.map((line) => line.amount)).toEqual([26.67, 26.66, 26.67]);
  });

  it("reverses the commission a refund left on the fee", () => {
    expect(
      commissionLeftAfterFeeShare([
        { staff_id: "alex", kind: "commission", amount: 400 },
        { staff_id: "alex", kind: "commission", amount: -320 },
      ]),
    ).toEqual([{ staff_id: "alex", amount: -80 }]);
    expect(
      commissionLeftAfterFeeShare([
        { staff_id: "alex", kind: "commission", amount: 400 },
        { staff_id: "alex", kind: "commission", amount: -320 },
        { staff_id: "alex", kind: "reversal", amount: -80, metadata: { reversed_kind: "commission" } },
      ]),
    ).toEqual([]);
  });

  it("does not take a salary back when the fee share is paid on top", () => {
    expect(feeShareReplacesStoredCommission("salary")).toBe(false);
    expect(feeShareReplacesStoredCommission("hourly")).toBe(false);
    expect(feeShareReplacesStoredCommission("booth_renter")).toBe(false);
    expect(feeShareReplacesStoredCommission("base_or_commission_higher")).toBe(false);
    expect(feeShareReplacesStoredCommission("commission_only")).toBe(true);
    expect(feeShareReplacesStoredCommission(null)).toBe(true);
  });
});
