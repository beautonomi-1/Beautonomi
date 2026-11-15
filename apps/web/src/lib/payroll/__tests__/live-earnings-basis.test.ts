import { describe, expect, it } from "vitest";
import { commissionPayableOnPlan } from "../compute-compensation";
import {
  applyTillTips,
  displayStaffEarnings,
  liveEarningsTotals,
  summarizeStaffEarningsLines,
  positiveServiceCommissionForBookings,
  withoutCommissionRefundClawbacks,
} from "../staff-earnings-from-lines";

describe("liveEarningsTotals", () => {
  it("shows the pay-run commission instead of the amount stored at payment", () => {
    const live = liveEarningsTotals(
      { commission: 400, tips: 50, adjustments: 0, total: 450 },
      340,
    );
    expect(live.commission).toBe(340);
    expect(live.tips).toBe(50);
    expect(live.total).toBe(390);
  });

  it("keeps a cancellation fee share when the pay-run commission replaces the stored figure", () => {
    const live = liveEarningsTotals(
      { commission: 100, tips: 0, adjustments: 0, total: 140, cancellationFeeShare: 40 },
      80,
    );
    expect(live.commission).toBe(80);
    expect(live.total).toBe(120);
  });

  it("includes a cancellation fee share in the commission shown under the total", () => {
    const shown = displayStaffEarnings(
      liveEarningsTotals(
        { commission: 100, tips: 0, adjustments: 0, total: 140, cancellationFeeShare: 40 },
        80,
      ),
    );
    expect(shown.commission).toBe(120);
    expect(shown.total).toBe(120);
  });

  it("adds a till tip on top of an appointment tip", () => {
    const live = applyTillTips(
      { commission: 100, tips: 80, adjustments: 0, total: 180, adjustment_breakdown: { commission: 0, tips: 0 } },
      50,
      true,
    );
    expect(live.tips).toBe(130);
    expect(live.total).toBe(230);
  });

  it("drops appointment and till tips when tips are turned off", () => {
    const live = applyTillTips(
      {
        commission: 100,
        tips: 80,
        adjustments: -20,
        total: 160,
        adjustment_breakdown: { commission: 0, tips: -20 },
      },
      50,
      false,
    );
    expect(live.tips).toBe(0);
    expect(live.adjustments).toBe(0);
    expect(live.total).toBe(100);
  });
});

describe("commissionPayableOnPlan", () => {
  const sales = {
    totalCommission: 300,
    serviceCommission: 300,
    productCommission: 0,
    serviceRevenue: 1500,
    productRevenue: 0,
    serviceTierRevenue: 1500,
    productTierRevenue: 0,
  };

  it("uses a marginal tier, not one flat rate on the whole period", () => {
    const payable = commissionPayableOnPlan(
      {
        payModel: "commission_only",
        serviceRate: 10,
        tierMode: "marginal",
        serviceTiers: [
          { minRevenue: 0, commissionRate: 10 },
          { minRevenue: 1000, commissionRate: 20 },
        ],
      },
      sales,
    );
    expect(payable).toBe(200);
  });

  it("pays a product its own percentage and leaves it out of the sales target", () => {
    expect(
      commissionPayableOnPlan(
        {
          payModel: "commission_above_threshold",
          serviceRate: 40,
          productRate: 20,
          thresholdAmount: 1000,
        },
        {
          totalCommission: 50,
          serviceCommission: 0,
          productCommission: 250,
          serviceRevenue: 0,
          productRevenue: 1500,
          productOverrideRevenue: 500,
          productOverrideCommission: 50,
        },
      ),
    ).toBe(50);
  });

  it("pays a service its own percentage and leaves it out of the sales target", () => {
    expect(
      commissionPayableOnPlan(
        {
          payModel: "commission_above_threshold",
          serviceRate: 40,
          productRate: 10,
          thresholdAmount: 1000,
        },
        {
          totalCommission: 30,
          serviceCommission: 430,
          productCommission: 0,
          serviceRevenue: 1200,
          productRevenue: 0,
          serviceOverrideRevenue: 200,
          serviceOverrideCommission: 30,
        },
      ),
    ).toBe(30);
  });

  it("pays the plan service and product rates when the calculated percentages are different", () => {
    expect(
      commissionPayableOnPlan(
        { payModel: "commission_only", serviceRate: 40, productRate: 10 },
        {
          totalCommission: 225,
          serviceCommission: 200,
          productCommission: 25,
          serviceRevenue: 1000,
          productRevenue: 500,
        },
      ),
    ).toBe(450);
  });

  it("pays a product its own percentage on top of the plan product rate", () => {
    expect(
      commissionPayableOnPlan(
        { payModel: "commission_only", serviceRate: 40, productRate: 10 },
        {
          totalCommission: 70,
          serviceCommission: 0,
          productCommission: 70,
          serviceRevenue: 0,
          productRevenue: 1000,
          productOverrideRevenue: 200,
          productOverrideCommission: 30,
        },
      ),
    ).toBe(110);
  });

  it("pays a service its own percentage on top of the plan service rate", () => {
    expect(
      commissionPayableOnPlan(
        { payModel: "commission_only", serviceRate: 40, productRate: 10 },
        {
          totalCommission: 430,
          serviceCommission: 230,
          productCommission: 0,
          serviceRevenue: 1200,
          productRevenue: 0,
          serviceOverrideRevenue: 200,
          serviceOverrideCommission: 30,
        },
      ),
    ).toBe(430);
  });

  it("takes a later product return off at the plan product rate", () => {
    expect(
      commissionPayableOnPlan(
        { payModel: "commission_only", serviceRate: 40, productRate: 10 },
        {
          totalCommission: -10,
          serviceCommission: 0,
          productCommission: 0,
          serviceRevenue: 0,
          productRevenue: 0,
          returnCommission: -10,
          returnBaseProductRevenue: -200,
          returnBaseProductCommission: -10,
        },
      ),
    ).toBe(-20);
  });

  it("pays a salary plan no sales commission", () => {
    expect(
      commissionPayableOnPlan(
        { payModel: "salary", baseMonthly: 10000, serviceRate: 40 },
        { ...sales, totalCommission: 400, serviceCommission: 400 },
      ),
    ).toBe(0);
  });
});

describe("positiveServiceCommissionForBookings", () => {
  it("sums only the service commission saved for the visits that included a product", () => {
    expect(
      positiveServiceCommissionForBookings(
        [
          { kind: "commission", amount: 100, booking_id: "monday" },
          { kind: "commission", amount: 70, booking_id: "friday" },
          { kind: "commission", amount: -10, booking_id: "friday" },
          { kind: "product_commission", amount: 10, booking_id: "friday" },
        ],
        new Set(["friday"]),
      ),
    ).toBe(70);
  });
});

describe("withoutCommissionRefundClawbacks", () => {
  it("drops the clawback already taken off this period's commission", () => {
    const kept = withoutCommissionRefundClawbacks(
      [
        { kind: "commission", amount: -160, booking_id: "this-week" },
        { kind: "product_commission", amount: -20, booking_id: "this-week" },
        { kind: "tip", amount: -15, booking_id: "this-week" },
        { kind: "commission", amount: -80, booking_id: "last-month" },
        { kind: "adjustment", amount: -10, booking_id: "this-week" },
      ],
      new Set(["this-week"]),
    );
    expect(kept.map((line) => line.amount)).toEqual([-15, -80, -10]);
  });

  it("keeps the service clawback when the stored commission still has the full visit", () => {
    const kept = withoutCommissionRefundClawbacks(
      [
        { kind: "commission", amount: -160, booking_id: "this-week" },
        { kind: "product_commission", amount: -20, booking_id: "this-week" },
      ],
      new Set(["this-week"]),
      { keepServiceClawbacks: true },
    );
    expect(kept.map((line) => line.amount)).toEqual([-160]);
  });
});

describe("cancellation fee share", () => {
  it("keeps the fee out of sales commission and in the total", () => {
    const summary = summarizeStaffEarningsLines([
      { kind: "commission", amount: 100 },
      { kind: "cancellation_fee_share", amount: 40 },
    ]);
    expect(summary.commission).toBe(100);
    expect(summary.cancellationFeeShare).toBe(40);
    expect(summary.total).toBe(140);
  });

  it("pays the fee share once when the visit also kept service commission", () => {
    const summary = summarizeStaffEarningsLines([
      { kind: "commission", amount: 400, booking_id: "colour" },
      { kind: "commission", amount: 400, booking_id: "cut" },
      { kind: "commission", amount: -320, booking_id: "cut" },
      {
        kind: "reversal",
        amount: -80,
        booking_id: "cut",
        metadata: { reversed_kind: "commission" },
      },
      { kind: "cancellation_fee_share", amount: 80, booking_id: "cut" },
    ]);
    expect(summary.commission).toBe(800);
    expect(summary.adjustments).toBe(-400);
    expect(summary.cancellationFeeShare).toBe(80);
    expect(summary.total).toBe(480);
  });

  it("takes last week's commission off when the fee is kept this week", () => {
    const summary = summarizeStaffEarningsLines([
      { kind: "commission", amount: -320, booking_id: "cut" },
      {
        kind: "reversal",
        amount: -80,
        booking_id: "cut",
        metadata: { reversed_kind: "commission" },
      },
      { kind: "cancellation_fee_share", amount: 80, booking_id: "cut" },
    ]);
    expect(summary.commission).toBe(0);
    expect(summary.adjustments).toBe(-400);
    expect(summary.cancellationFeeShare).toBe(80);
    expect(summary.total).toBe(-320);
  });
});

describe("product commission lines", () => {
  it("does not pay a product twice, and still claws a refund back", () => {
    const summary = summarizeStaffEarningsLines([
      { kind: "commission", amount: 320 },
      { kind: "product_commission", amount: 20 },
      { kind: "product_commission", amount: -20 },
    ]);
    expect(summary.commission).toBe(320);
    expect(summary.adjustments).toBe(-20);
    expect(summary.total).toBe(300);
  });
});
