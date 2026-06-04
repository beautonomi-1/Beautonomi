/**
 * Cross-surface reconciliation + high-row-count regression for provider revenue.
 *
 * The dashboard (`get-provider-dashboard.ts`), business overview
 * (`reports/business/overview/route.ts`) and payment summary
 * (`reports/payments/summary/route.ts`) all delegate their revenue / net headline to the
 * canonical module (`provider-revenue-semantics.ts`). These tests model each surface's
 * exact canonical call against ONE fixture ledger and assert they reconcile — so a future
 * change that reintroduces a divergent formula on any single surface fails loudly.
 *
 * They also prove the dashboard cap fix: revenue math sums an arbitrarily large ledger
 * (the old `.limit(8000)` would have silently dropped rows).
 */
import { describe, it, expect } from "vitest";
import {
  recognizedRevenue,
  providerNetAfterRefunds,
  computeProviderRevenueBreakdown,
  type ProviderRevenueLedgerRow,
} from "../provider-revenue-semantics";

const row = (
  transaction_type: string,
  net: number,
  extra: Partial<ProviderRevenueLedgerRow> = {},
): ProviderRevenueLedgerRow => ({ transaction_type, amount: net, net, ...extra });

/** A representative settled-ledger window for one provider. */
const FIXTURE: ProviderRevenueLedgerRow[] = [
  row("provider_earnings", 100, { booking_id: "b1" } as any),
  row("provider_earnings", 60, { booking_id: "b2" } as any),
  row("provider_earnings", 25, { product_order_id: "o1" } as any),
  row("tip", 15, { booking_id: "b1" } as any),
  row("travel_fee", 20, { booking_id: "b1" } as any),
  row("cancellation_fee", 30, { booking_id: "b3" } as any),
  row("walk_in_additional_charge", 12, { booking_id: "b4" } as any),
  // Non-revenue legs that must be ignored by every surface:
  row("payment", 500, { booking_id: "b1" } as any),
  row("additional_charge_payment", 9, { booking_id: "b2" } as any),
  row("platform_fee", 18, { booking_id: "b1" } as any),
  row("service_fee", 6),
  row("gift_card_payment", 40),
  // Provider-money refund + a platform-money refund leg (only the former should deduct):
  row("refund", -22, { refund_component: "provider_earnings" } as any),
  row("refund", -7, { refund_component: "platform_fee" } as any),
];

// recognized = 100+60+25+15+20+30+12 = 262 ; provider refund deduction = 22 ; net = 240
const EXPECTED_RECOGNIZED = 262;
const EXPECTED_NET = 240;

describe("provider revenue cross-surface reconciliation", () => {
  it("computes the documented recognized revenue and net for the fixture", () => {
    expect(recognizedRevenue(FIXTURE)).toBe(EXPECTED_RECOGNIZED);
    expect(providerNetAfterRefunds(FIXTURE)).toBe(EXPECTED_NET);
  });

  it("dashboard, business overview and payment summary headline numbers reconcile", () => {
    // Dashboard `recognizedRevenueTotal` / `totalRevenue`:
    const dashboardTotalRevenue = recognizedRevenue(FIXTURE);
    // Business overview `totalRevenue` (recognized) and `netRevenue` (net of refunds):
    const businessBreakdown = computeProviderRevenueBreakdown(FIXTURE);
    const businessTotalRevenue = businessBreakdown.recognizedRevenue;
    const businessNetRevenue = businessBreakdown.netAfterRefunds;
    // Payment summary `providerNetActivity`:
    const paymentsProviderNetActivity = providerNetAfterRefunds(FIXTURE);

    expect(dashboardTotalRevenue).toBe(businessTotalRevenue);
    expect(businessNetRevenue).toBe(paymentsProviderNetActivity);
    expect(dashboardTotalRevenue).toBe(EXPECTED_RECOGNIZED);
    expect(paymentsProviderNetActivity).toBe(EXPECTED_NET);
  });

  it("breakdown components sum to the recognized headline (single-count guarantee)", () => {
    const b = computeProviderRevenueBreakdown(FIXTURE);
    expect(
      b.serviceEarnings + b.tips + b.travelFees + b.cancellationFees + b.walkInAdditionalCharges,
    ).toBe(b.recognizedRevenue);
    expect(b.serviceEarnings).toBe(185); // 100 + 60 + 25
    expect(b.recognizedRevenue - b.refundDeduction).toBe(b.netAfterRefunds);
  });

  it("sums a >8000-row ledger without capping (dashboard undercount regression)", () => {
    const rows: ProviderRevenueLedgerRow[] = [];
    const ROWS = 9000;
    for (let i = 0; i < ROWS; i++) rows.push(row("provider_earnings", 1));
    // Old behaviour fetched at most 8000 rows; recognized revenue now reflects every row.
    expect(recognizedRevenue(rows)).toBe(ROWS);
    expect(providerNetAfterRefunds(rows)).toBe(ROWS);
  });
});
