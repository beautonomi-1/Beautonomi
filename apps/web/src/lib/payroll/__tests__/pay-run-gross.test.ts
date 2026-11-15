import { describe, expect, it } from "vitest";
import { assembleStaffPayRunGross } from "../assemble-staff-pay-run-gross";
import { liveEarningsFromPayRun } from "../staff-earnings-from-lines";

describe("assembleStaffPayRunGross", () => {
  it("uses ledger service commission plus product calc without double-counting product from lines", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: true,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
      payPlan: null,
      productCalc: {
        totalCommission: 300,
        serviceCommission: 200,
        productCommission: 100,
        serviceRevenue: 1000,
        productRevenue: 500,
      },
      linesSummary: {
        commission: 150,
        tips: 0,
        adjustments: -20,
        total: 130,
        adjustment_breakdown: { commission: -20, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(230);
    expect(result.commissionClawback).toBe(20);
  });

  it("removes appointment retail from the service commission stored at payment", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 40 },
      productCalc: {
        totalCommission: 400,
        serviceCommission: 320,
        productCommission: 80,
        serviceRevenue: 800,
        productRevenue: 200,
        appointmentProductRevenue: 200,
      },
      linesSummary: {
        commission: 400,
        tips: 0,
        adjustments: 0,
        total: 400,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(400);
  });

  it("does not leave another stylist's share of the product inside their service commission", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s2",
      staffName: "Sam",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 160,
        serviceCommission: 160,
        productCommission: 0,
        serviceRevenue: 400,
        productRevenue: 0,
        serviceExcludesAppointmentRetail: true,
      },
      linesSummary: {
        commission: 200,
        tips: 0,
        adjustments: 0,
        total: 200,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(160);
  });

  it("keeps a visit without a product on the commission saved when the client paid", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 650,
        serviceCommission: 640,
        productCommission: 10,
        serviceRevenue: 1600,
        productRevenue: 100,
        appointmentProductRevenue: 100,
        serviceExcludesAppointmentRetail: true,
        serviceCommissionOnAdjustedBookings: 60,
      },
      linesSummary: {
        commission: 170,
        tips: 0,
        adjustments: -30,
        total: 140,
        adjustment_breakdown: { commission: -30, tips: 0 },
        positiveCommissionOnAdjustedBookings: 70,
        samePeriodServiceClawback: -30,
        samePeriodServiceClawbackOnAdjustedBookings: -10,
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(150);
  });

  it("takes the product out of the saved commission and does not switch that visit to today's percentage", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 650,
        serviceCommission: 640,
        productCommission: 10,
        serviceRevenue: 1600,
        productRevenue: 100,
        appointmentProductRevenue: 100,
        serviceExcludesAppointmentRetail: true,
        serviceCommissionOnAdjustedBookings: 240,
        adjustedServiceKeptRevenue: 600,
        adjustedServiceExcludedRevenue: 100,
      },
      linesSummary: {
        commission: 170,
        tips: 0,
        adjustments: 0,
        total: 170,
        adjustment_breakdown: { commission: 0, tips: 0 },
        positiveCommissionOnAdjustedBookings: 70,
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(170);
  });

  it("keeps each product visit at the rate saved for that visit", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 999,
        serviceCommission: 999,
        productCommission: 20,
        serviceRevenue: 800,
        productRevenue: 200,
        appointmentProductRevenue: 200,
        serviceExcludesAppointmentRetail: true,
        serviceCommissionOnAdjustedBookings: 999,
        adjustedServiceKeptRevenue: 700,
        adjustedServiceExcludedRevenue: 200,
        adjustedVisits: [
          { bookingId: "friday", keptRevenue: 100, excludedRevenue: 100, ownRateAddonCommission: 0 },
          { bookingId: "saturday", keptRevenue: 600, excludedRevenue: 100, ownRateAddonCommission: 0 },
        ],
      },
      linesSummary: {
        commission: 210,
        tips: 0,
        adjustments: 0,
        total: 210,
        adjustment_breakdown: { commission: 0, tips: 0 },
        positiveCommissionOnAdjustedBookings: 110,
        positiveCommissionByBooking: { friday: 40, saturday: 70 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(200);
  });

  it("does not take a product sold on someone else's appointment out of this person's saved service commission", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: null,
      productCalc: {
        totalCommission: 110,
        serviceCommission: 100,
        productCommission: 10,
        serviceRevenue: 1000,
        productRevenue: 100,
        appointmentProductRevenue: 100,
        appointmentProductRevenueOnServicedBookings: 0,
      },
      linesSummary: {
        commission: 100,
        tips: 0,
        adjustments: 0,
        total: 100,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(110);
  });

  it("applies carry-forward balance to net pay", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-07",
      payPlan: null,
      productCalc: {
        totalCommission: 100,
        serviceCommission: 100,
        productCommission: 0,
        serviceRevenue: 200,
        productRevenue: 0,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
      carryForwardBalance: -50,
    });
    expect(result.carryForwardIn).toBe(50);
    expect(result.netPay).toBe(50);
  });

  it("pays a salary plan from the plan and ignores a leftover hourly rate", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: false,
      tipsEnabled: false,
      hoursWorked: 10,
      hourlyRateFallback: 200,
      salaryFallback: 99999,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "salary", baseMonthly: 10000 },
      productCalc: {
        totalCommission: 500,
        serviceCommission: 500,
        productCommission: 0,
        serviceRevenue: 2000,
        productRevenue: 0,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.salaryAmount).toBe(10000);
    expect(result.hourlyAmount).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it("keeps commission from the plan when the legacy commission flag is off", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: false,
      tipsEnabled: false,
      hoursWorked: 8,
      hourlyRateFallback: 150,
      salaryFallback: 4000,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 400,
        serviceCommission: 400,
        productCommission: 0,
        serviceRevenue: 1000,
        productRevenue: 0,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(400);
    expect(result.hourlyAmount).toBe(0);
    expect(result.salaryAmount).toBe(0);
  });

  it("does not pay commission or hourly when a salary plan has no salary this period", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 10,
      hourlyRateFallback: 200,
      salaryFallback: 8000,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "salary", hourlyRate: 200 },
      productCalc: {
        totalCommission: 500,
        serviceCommission: 500,
        productCommission: 0,
        serviceRevenue: 2000,
        productRevenue: 0,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.salaryAmount).toBe(0);
    expect(result.hourlyAmount).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it("pays hourly from the clock and leaves commission off an hourly plan", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 8,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "hourly", hourlyRate: 50 },
      productCalc: {
        totalCommission: 400,
        serviceCommission: 400,
        productCommission: 0,
        serviceRevenue: 1000,
        productRevenue: 0,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.hourlyAmount).toBe(400);
    expect(result.commissionAmount).toBe(0);
    expect(result.salaryAmount).toBe(0);
  });

  it("adds a service's own percentage on top of the tier", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: {
        payModel: "commission_only",
        serviceRate: 10,
        tierMode: "retroactive",
        serviceTiers: [
          { minRevenue: 0, commissionRate: 10 },
          { minRevenue: 1000, commissionRate: 20 },
        ],
      },
      productCalc: {
        totalCommission: 100,
        serviceCommission: 100,
        productCommission: 0,
        serviceRevenue: 2000,
        productRevenue: 0,
        serviceTierRevenue: 1500,
        serviceOverrideCommission: 80,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(380);
  });

  it("uses a marginal tier instead of the flat rate recorded on the sale", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: {
        payModel: "commission_only",
        serviceRate: 10,
        tierMode: "marginal",
        serviceTiers: [
          { minRevenue: 0, commissionRate: 10 },
          { minRevenue: 1000, commissionRate: 20 },
        ],
      },
      productCalc: {
        totalCommission: 100,
        serviceCommission: 100,
        productCommission: 0,
        serviceRevenue: 1500,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 100,
        tips: 0,
        adjustments: 0,
        total: 100,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(200);
  });

  it("takes a later product return off after the tier, so this period's sales keep the rate they reached", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: {
        payModel: "commission_only",
        serviceRate: 10,
        productRate: 10,
        tierMode: "marginal",
        serviceTiers: [
          { minRevenue: 0, commissionRate: 10 },
          { minRevenue: 1000, commissionRate: 20 },
        ],
      },
      productCalc: {
        totalCommission: 180,
        serviceCommission: 200,
        productCommission: 0,
        serviceRevenue: 1500,
        productRevenue: 0,
        serviceTierRevenue: 1500,
        productTierRevenue: 0,
        returnCommission: -20,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(180);
    expect(result.netPay).toBe(180);
  });

  it("does not take a product return off a salary", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "salary", baseMonthly: 10000 },
      productCalc: {
        totalCommission: -20,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        returnCommission: -20,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.salaryAmount).toBe(10000);
    expect(result.commissionAmount).toBe(0);
    expect(result.netPay).toBe(10000);
  });

  it("uses the plan percentage when the period only has a tip line", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: true,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 400,
        serviceCommission: 400,
        productCommission: 0,
        serviceRevenue: 1000,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 0,
        tips: 50,
        adjustments: 0,
        total: 50,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 50,
    });
    expect(result.commissionAmount).toBe(400);
    expect(result.tipsAmount).toBe(50);
  });

  it("keeps a manual adjustment on a salary plan and leaves sales commission off", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "salary", baseMonthly: 10000 },
      productCalc: {
        totalCommission: 500,
        serviceCommission: 500,
        productCommission: 0,
        serviceRevenue: 2000,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 500,
        tips: 0,
        adjustments: 80,
        total: 580,
        adjustment_breakdown: { commission: 80, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.salaryAmount).toBe(10000);
    expect(result.commissionAmount).toBe(80);
    expect(result.hourlyAmount).toBe(0);
  });

  it("applies a commission clawback on top of the plan rate", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 250,
        serviceCommission: 150,
        productCommission: 100,
        serviceRevenue: 1000,
        productRevenue: 500,
      },
      linesSummary: {
        commission: 150,
        tips: 0,
        adjustments: -20,
        total: 130,
        adjustment_breakdown: { commission: -20, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(230);
    expect(result.commissionClawback).toBe(20);
    expect(result.salaryAmount).toBe(0);
  });

  it("carries a product return to the next run when this period has no other commission", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: -20,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        returnCommission: -20,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(-20);
    expect(result.netPay).toBe(0);
    expect(result.carryForwardOut).toBe(20);
  });

  it("takes a returned tip off when this period has no new tip", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: true,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 0,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 0,
        tips: 0,
        adjustments: -50,
        total: -50,
        adjustment_breakdown: { commission: 0, tips: -50 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.tipsAmount).toBe(-50);
    expect(result.netPay).toBe(0);
    expect(result.carryForwardOut).toBe(50);
  });

  it("adds a till tip on top of an appointment tip", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: true,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 0,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 0,
        tips: 80,
        adjustments: 0,
        total: 80,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
      posSaleTips: 50,
    });
    expect(result.tipsAmount).toBe(130);
  });

  it("leaves a till tip off when tips are turned off", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 400,
        serviceCommission: 400,
        productCommission: 0,
        serviceRevenue: 1000,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 0,
        tips: 80,
        adjustments: -20,
        total: 60,
        adjustment_breakdown: { commission: 0, tips: -20 },
      },
      tipsFromPeriod: 0,
      posSaleTips: 50,
    });
    expect(result.tipsAmount).toBe(0);
    expect(result.commissionAmount).toBe(400);
  });

  it("pays a till service on top of appointment commission already stored", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 180,
        serviceCommission: 180,
        productCommission: 0,
        serviceRevenue: 450,
        productRevenue: 0,
        posServiceTierRevenue: 200,
      },
      linesSummary: {
        commission: 100,
        tips: 0,
        adjustments: 0,
        total: 100,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(180);
  });

  it("pays a service its own percentage instead of the plan rate", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40 },
      productCalc: {
        totalCommission: 350,
        serviceCommission: 350,
        productCommission: 0,
        serviceRevenue: 1000,
        productRevenue: 0,
        serviceOverrideRevenue: 200,
        serviceOverrideCommission: 30,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(350);
  });

  it("includes a till service before choosing the guarantee or the commission", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "base_or_commission_higher", serviceRate: 40, baseMonthly: 5000 },
      productCalc: {
        totalCommission: 5200,
        serviceCommission: 5200,
        productCommission: 0,
        serviceRevenue: 13000,
        productRevenue: 0,
        posServiceTierRevenue: 1000,
      },
      linesSummary: {
        commission: 4800,
        tips: 0,
        adjustments: 0,
        total: 4800,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(5200);
    expect(result.salaryAmount).toBe(0);
  });

  it("pays a product its own percentage and leaves it out of the sales target", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: {
        payModel: "commission_above_threshold",
        serviceRate: 40,
        productRate: 20,
        thresholdAmount: 1000,
      },
      productCalc: {
        totalCommission: 50,
        serviceCommission: 0,
        productCommission: 250,
        serviceRevenue: 0,
        productRevenue: 1500,
        productOverrideRevenue: 500,
        productOverrideCommission: 50,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(50);
  });

  it("pays a cancellation fee share on top of a salary", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "salary", baseMonthly: 10000 },
      productCalc: {
        totalCommission: 0,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 0,
        tips: 0,
        adjustments: 0,
        total: 40,
        cancellationFeeShare: 40,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.salaryAmount).toBe(10000);
    expect(result.commissionAmount).toBe(40);
    expect(result.netPay).toBe(10040);
  });

  it("pays the plan product rate when the stored product percentage is different", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 225,
        serviceCommission: 200,
        productCommission: 25,
        serviceRevenue: 1000,
        productRevenue: 500,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(450);
  });

  it("keeps stored service commission and still pays the plan product rate", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 175,
        serviceCommission: 150,
        productCommission: 25,
        serviceRevenue: 1000,
        productRevenue: 500,
      },
      linesSummary: {
        commission: 150,
        tips: 0,
        adjustments: 0,
        total: 150,
        adjustment_breakdown: { commission: 0, tips: 0 },
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(200);
  });

  it("pays a product its own percentage on top of the plan product rate", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-04-01",
      periodEnd: "2026-04-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 70,
        serviceCommission: 0,
        productCommission: 70,
        serviceRevenue: 0,
        productRevenue: 1000,
        productOverrideRevenue: 200,
        productOverrideCommission: 30,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(110);
  });

  it("takes a later product return off at the plan product rate", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: -10,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        returnCommission: -10,
        returnBaseProductRevenue: -200,
        returnBaseProductCommission: -10,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(-20);
    expect(result.netPay).toBe(0);
    expect(result.carryForwardOut).toBe(20);
  });

  it("keeps a returned product's own percentage", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: -30,
        serviceCommission: 0,
        productCommission: 0,
        serviceRevenue: 0,
        productRevenue: 0,
        returnCommission: -30,
      },
      linesSummary: null,
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(-30);
  });

  it("takes a same-week refund off the stored service commission", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 240,
        serviceCommission: 240,
        productCommission: 0,
        serviceRevenue: 600,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 200,
        tips: 0,
        adjustments: -80,
        total: 120,
        adjustment_breakdown: { commission: -80, tips: 0 },
        samePeriodServiceClawback: -80,
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(120);
  });

  it("does not take a same-week refund off again when the sales figure is already reduced", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 240,
        serviceCommission: 240,
        productCommission: 0,
        serviceRevenue: 600,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 0,
        tips: 0,
        adjustments: -160,
        total: -160,
        adjustment_breakdown: { commission: -160, tips: 0 },
        samePeriodServiceClawback: -160,
      },
      tipsFromPeriod: 0,
    });
    expect(result.commissionAmount).toBe(240);
  });

  it("compares the guarantee with commission after a same-week refund", () => {
    const result = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "base_or_commission_higher", baseMonthly: 5000, serviceRate: 40 },
      productCalc: {
        totalCommission: 4800,
        serviceCommission: 4800,
        productCommission: 0,
        serviceRevenue: 12000,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 5200,
        tips: 0,
        adjustments: -400,
        total: 4800,
        adjustment_breakdown: { commission: -400, tips: 0 },
        samePeriodServiceClawback: -400,
      },
      tipsFromPeriod: 0,
    });
    expect(result.salaryAmount).toBe(5000);
    expect(result.commissionAmount).toBe(0);
  });

  it("shows My earnings as the same commission the payslip pays", () => {
    const payslip = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: true,
      tipsEnabled: false,
      hoursWorked: 0,
      hourlyRateFallback: 0,
      salaryFallback: 0,
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
      payPlan: { payModel: "commission_only", serviceRate: 40, productRate: 10 },
      productCalc: {
        totalCommission: 240,
        serviceCommission: 240,
        productCommission: 0,
        serviceRevenue: 600,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 200,
        tips: 0,
        adjustments: -80,
        total: 120,
        adjustment_breakdown: { commission: -80, tips: 0 },
        samePeriodServiceClawback: -80,
      },
      tipsFromPeriod: 0,
      ignoreBasePay: true,
    });
    const live = liveEarningsFromPayRun({
      commissionAmount: payslip.commissionAmount,
      tipsAmount: payslip.tipsAmount,
      commissionAdjustments: payslip.includedAdjustments,
    });
    expect(payslip.commissionAmount).toBe(120);
    expect(live.total).toBe(120);
  });

  it("pays a booth renter nothing through payroll", () => {
    const payslip = assembleStaffPayRunGross({
      staffId: "s1",
      staffName: "Alex",
      commissionEnabled: false,
      tipsEnabled: true,
      hoursWorked: 40,
      hourlyRateFallback: 100,
      salaryFallback: 8000,
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      payPlan: { payModel: "booth_renter" },
      productCalc: {
        totalCommission: 400,
        serviceCommission: 400,
        productCommission: 0,
        serviceRevenue: 1000,
        productRevenue: 0,
      },
      linesSummary: {
        commission: 400,
        tips: 50,
        adjustments: -20,
        total: 430,
        adjustment_breakdown: { commission: -20, tips: 0 },
      },
      tipsFromPeriod: 50,
    });
    const live = liveEarningsFromPayRun({
      commissionAmount: payslip.commissionAmount,
      tipsAmount: payslip.tipsAmount,
      commissionAdjustments: payslip.includedAdjustments,
    });
    expect(payslip.commissionAmount).toBe(0);
    expect(payslip.tipsAmount).toBe(0);
    expect(payslip.salaryAmount).toBe(0);
    expect(payslip.hourlyAmount).toBe(0);
    expect(payslip.netPay).toBe(0);
    expect(live.total).toBe(0);
  });
});
