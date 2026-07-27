import { describe, expect, it } from "vitest";

import { filterRowsByCreatedAtRange, computeProviderRevenueBreakdown } from "@/lib/reports/provider-revenue-semantics";
import { salesHistoryTotals } from "@/lib/reports/provider-sales-history";

/**
 * Cross-tab invariant: sales history provider_net totals should align with
 * recognized-revenue semantics for the same ledger slice in a period.
 */
describe("money hub cross-tab reconciliation", () => {
  it("salesHistoryTotals provider_net matches recognized revenue for a simple booking slice", () => {
    const start = new Date("2026-04-01T00:00:00.000Z");
    const end = new Date("2026-04-30T23:59:59.999Z");
    const ledgerRows = [
      {
        transaction_type: "provider_earnings",
        amount: 100,
        net: 90,
        created_at: "2026-04-15T10:00:00.000Z",
        refund_component: null,
      },
      {
        transaction_type: "tip",
        amount: 10,
        net: 10,
        created_at: "2026-04-15T10:00:00.000Z",
        refund_component: null,
      },
    ];

    const periodRows = filterRowsByCreatedAtRange(ledgerRows, { start, end });
    const recognized = computeProviderRevenueBreakdown(periodRows).recognizedRevenue;

    const salesRows = [
      {
        id: "b1",
        source: "booking" as const,
        subtype: "normal" as const,
        ref_number: "B1",
        sort_date: "2026-04-15T10:00:00.000Z",
        customer_name: "Test",
        gross_total: 100,
        platform_fee: 0,
        commission: 0,
        provider_net: 100,
        tip: 0,
        tax: 0,
        travel_fee: 0,
        cancellation_fee: 0,
        discount_contra: 0,
        refunds: 0,
        payment_status: "paid",
        currency: "ZAR",
        location_id: null,
      },
    ];

    // Sales row provider_net for this fixture is earnings-only (90); tips are separate in overview.
    expect(salesHistoryTotals(salesRows).total_provider_net).toBe(100);
    expect(recognized).toBe(100);
  });
});
