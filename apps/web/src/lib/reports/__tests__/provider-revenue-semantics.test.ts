import { describe, it, expect } from "vitest";
import {
  RECOGNIZED_REVENUE_TYPES,
  recognizedRevenue,
  recognizedRevenueInRange,
  filterRowsByCreatedAtRange,
  providerServiceEarnings,
  providerRefundDeduction,
  providerNetAfterRefunds,
  computeProviderRevenueBreakdown,
  type ProviderRevenueLedgerRow,
} from "../provider-revenue-semantics";

const row = (
  transaction_type: string,
  net: number,
  extra: Partial<ProviderRevenueLedgerRow> = {},
): ProviderRevenueLedgerRow => ({ transaction_type, amount: net, net, ...extra });

describe("provider-revenue-semantics", () => {
  it("counts each recognized revenue type exactly once (no travel/tip double-count)", () => {
    const rows: ProviderRevenueLedgerRow[] = [
      row("provider_earnings", 100),
      row("tip", 20),
      row("travel_fee", 15),
      row("cancellation_fee", 30),
      row("walk_in_additional_charge", 10),
      // Non-revenue / platform legs must be ignored:
      row("payment", 999),
      row("additional_charge_payment", 7),
      row("platform_fee", 12),
      row("service_fee", 5),
      row("tax", 8),
    ];
    expect(recognizedRevenue(rows)).toBe(175);
    expect(providerServiceEarnings(rows)).toBe(100);
  });

  it("uses net (== amount) so travel is not added twice via amount and provider_earnings", () => {
    // provider_earnings already excludes travel; travel posts separately. The total is additive.
    const rows = [row("provider_earnings", 90), row("travel_fee", 40)];
    expect(recognizedRevenue(rows)).toBe(130);
  });

  it("nets legacy negative provider_earnings reversals into recognized revenue", () => {
    const rows = [
      row("provider_earnings", 100),
      row("provider_earnings", -40), // legacy refund reversal
    ];
    expect(recognizedRevenue(rows)).toBe(60);
    expect(providerServiceEarnings(rows)).toBe(60);
  });

  it("deducts only provider-money refund components, not platform/tender legs", () => {
    const rows = [
      row("provider_earnings", 100),
      row("refund", -30, { refund_component: "provider_earnings" }),
      row("refund", -12, { refund_component: "platform_fee" }), // platform money — ignored
      row("refund", -8, { refund_component: "wallet_payment" }), // tender leg — ignored
      row("refund", -5, { refund_component: null }), // legacy/whole refund — counts
    ];
    expect(providerRefundDeduction(rows)).toBe(35);
    expect(providerNetAfterRefunds(rows)).toBe(65);
  });

  it("does not double-count modern refunds against legacy reversals", () => {
    // Modern path: refund component rows; no negative provider_earnings reversal present.
    const modern = [
      row("provider_earnings", 100),
      row("refund", -25, { refund_component: "provider_earnings" }),
    ];
    expect(providerNetAfterRefunds(modern)).toBe(75);

    // Legacy path: negative provider_earnings reversal; no refund rows.
    const legacy = [row("provider_earnings", 100), row("provider_earnings", -25)];
    expect(providerNetAfterRefunds(legacy)).toBe(75);
  });

  it("computeProviderRevenueBreakdown reconciles to recognizedRevenue and net", () => {
    const rows = [
      row("provider_earnings", 200),
      row("tip", 50),
      row("travel_fee", 25),
      row("cancellation_fee", 40),
      row("walk_in_additional_charge", 15),
      row("refund", -60, { refund_component: "provider_earnings" }),
    ];
    const b = computeProviderRevenueBreakdown(rows);
    expect(b.serviceEarnings).toBe(200);
    expect(b.tips).toBe(50);
    expect(b.travelFees).toBe(25);
    expect(b.cancellationFees).toBe(40);
    expect(b.walkInAdditionalCharges).toBe(15);
    expect(b.recognizedRevenue).toBe(330);
    expect(b.refundDeduction).toBe(60);
    expect(b.netAfterRefunds).toBe(270);
    // breakdown must agree with the standalone helpers
    expect(b.recognizedRevenue).toBe(recognizedRevenue(rows));
    expect(b.netAfterRefunds).toBe(providerNetAfterRefunds(rows));
  });

  it("RECOGNIZED_REVENUE_TYPES is the documented closed set", () => {
    expect([...RECOGNIZED_REVENUE_TYPES]).toEqual([
      "provider_earnings",
      "tip",
      "travel_fee",
      "cancellation_fee",
      "walk_in_additional_charge",
    ]);
  });

  it("recognizedRevenueInRange filters by created_at inclusive bounds", () => {
    const rows = [
      { transaction_type: "provider_earnings", net: 50, created_at: "2026-06-01T10:00:00.000Z" },
      { transaction_type: "tip", net: 10, created_at: "2026-06-02T10:00:00.000Z" },
      { transaction_type: "provider_earnings", net: 99, created_at: "2026-06-10T10:00:00.000Z" },
    ];
    const start = new Date("2026-06-01T00:00:00.000Z");
    const end = new Date("2026-06-03T23:59:59.999Z");
    expect(recognizedRevenueInRange(rows, { start, end })).toBe(60);
  });

  it("filterRowsByCreatedAtRange + breakdown tips match recognized components", () => {
    const rows = [
      { transaction_type: "provider_earnings", net: 60, created_at: "2026-07-24T17:28:38.000Z" },
      { transaction_type: "tip", net: 10, created_at: "2026-07-24T17:28:37.000Z" },
      { transaction_type: "travel_fee", net: 120, created_at: "2026-07-24T17:28:37.000Z" },
      { transaction_type: "tip", net: 5, created_at: "2026-06-01T10:00:00.000Z" },
    ];
    const start = new Date("2026-07-24T00:00:00.000Z");
    const end = new Date("2026-07-25T23:59:59.999Z");
    const periodBreakdown = computeProviderRevenueBreakdown(
      filterRowsByCreatedAtRange(rows, { start, end }),
    );
    expect(periodBreakdown.tips).toBe(10);
    expect(periodBreakdown.travelFees).toBe(120);
    expect(periodBreakdown.serviceEarnings).toBe(60);
    expect(periodBreakdown.recognizedRevenue).toBe(190);
  });
});
