import { describe, expect, it } from "vitest";

import { aggregateFinanceLedgerRows } from "../aggregate-finance-ledger-rows";
import { computeAdminBookingsListStats } from "../bookings-list-stats";
import {
  providerNetAfterRefunds,
  recognizedRevenue,
} from "@/lib/reports/provider-revenue-semantics";

describe("financial reporting audit — admin provider recognized earnings", () => {
  const recognizedRows = [
    { transaction_type: "provider_earnings", net: 80 },
    { transaction_type: "tip", net: 10 },
    { transaction_type: "travel_fee", net: 15, amount: 15 },
    { transaction_type: "cancellation_fee", net: 5 },
    { transaction_type: "walk_in_additional_charge", net: 20 },
  ];

  it("provider_recognized_revenue_gross includes travel and walk-in add-ons", () => {
    const agg = aggregateFinanceLedgerRows(recognizedRows);
    expect(agg.walk_in_additional_charges).toBe(20);
    expect(agg.provider_recognized_revenue_gross).toBe(recognizedRevenue(recognizedRows));
    expect(agg.provider_recognized_revenue_gross).toBe(130);
  });

  it("admin provider net after refunds matches providerNetAfterRefunds semantics", () => {
    const agg = aggregateFinanceLedgerRows(recognizedRows);
    const providerRefundImpact = Math.abs(agg.provider_refund_net_impact);
    expect(agg.provider_recognized_revenue_gross - providerRefundImpact).toBe(
      providerNetAfterRefunds(recognizedRows),
    );
  });

  it("provider refund clawback reduces recognized net", () => {
    const withRefund = [
      ...recognizedRows,
      {
        transaction_type: "refund",
        net: -30,
        amount: -30,
        refund_component: "provider_earnings",
      },
    ];
    const agg = aggregateFinanceLedgerRows(withRefund);
    const providerRefundImpact = Math.abs(agg.provider_refund_net_impact);
    expect(agg.provider_recognized_revenue_gross - providerRefundImpact).toBe(
      providerNetAfterRefunds(withRefund),
    );
    expect(providerNetAfterRefunds(withRefund)).toBe(100);
  });

  it("split-refund components: provider impact counts only provider-earnings legs", () => {
    const withSplitRefund = [
      ...recognizedRows,
      {
        transaction_type: "refund",
        net: -50,
        amount: -50,
        refund_component: "provider_earnings",
      },
      {
        transaction_type: "refund",
        net: -20,
        amount: -20,
        commission: -4,
        refund_component: "platform_fee",
      },
      {
        transaction_type: "refund",
        net: -10,
        amount: -10,
        refund_component: "wallet_payment",
      },
      {
        transaction_type: "refund",
        net: -15,
        amount: -15,
        refund_component: "promotion_discount",
      },
    ];
    const agg = aggregateFinanceLedgerRows(withSplitRefund);
    expect(agg.provider_refund_net_impact).toBe(-50);
    expect(agg.platform_refund_contra).toBe(-4);
    expect(agg.refunds_gross).toBe(70);
    const providerRefundImpact = Math.abs(agg.provider_refund_net_impact);
    expect(agg.provider_recognized_revenue_gross - providerRefundImpact).toBe(
      providerNetAfterRefunds(withSplitRefund),
    );
    expect(providerNetAfterRefunds(withSplitRefund)).toBe(80);
  });
});

describe("financial reporting audit — admin bookings list stats", () => {
  it("sums completed GMV tenant-wide, not page-local", () => {
    const stats = computeAdminBookingsListStats([
      { status: "completed", total_amount: 100 },
      { status: "completed", total_amount: 250 },
      { status: "confirmed", total_amount: 80 },
      { status: "cancelled", total_amount: 40 },
    ]);
    expect(stats.completed).toBe(2);
    expect(stats.completed_gmv).toBe(350);
    expect(stats.total).toBe(4);
    expect(stats.confirmed).toBe(1);
  });

  it("avg booking value from report stats = completed GMV / completed count", () => {
    const stats = computeAdminBookingsListStats([
      { status: "completed", total_amount: 100 },
      { status: "completed", total_amount: 200 },
    ]);
    const avgBookingValue = stats.completed > 0 ? stats.completed_gmv / stats.completed : 0;
    expect(avgBookingValue).toBe(150);
  });
});
