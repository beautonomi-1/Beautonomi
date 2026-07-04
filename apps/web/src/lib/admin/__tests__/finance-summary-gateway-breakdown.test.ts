import { describe, expect, it } from "vitest";
import {
  aggregateFinanceLedgerRows,
  gatewayFeesTotalFromAggregate,
} from "@/lib/admin/aggregate-finance-ledger-rows";

describe("finance summary gateway breakdown shape", () => {
  it("exposes terminal + services buckets matching gatewayFeesTotalFromAggregate", () => {
    const agg = aggregateFinanceLedgerRows([
      {
        id: "1",
        transaction_type: "payment",
        amount: 100,
        fees: 2,
        net: 10,
        commission: 10,
        created_at: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "2",
        transaction_type: "terminal_sale",
        amount: 300,
        fees: 8,
        net: 292,
        commission: 0,
        created_at: "2026-07-01T00:00:00.000Z",
      },
    ]);

    const breakdown = {
      services: agg.gateway_fees_services,
      terminal: agg.terminal_gateway_fees,
      subscription: agg.subscription_gateway_fees,
      ads: agg.ads_gateway_fees,
      marketing_credits: agg.marketing_credit_gateway_fees,
      gift_card_wallet: agg.other_gateway_fees,
      payout_transfers: agg.payout_transfer_fees,
      total: gatewayFeesTotalFromAggregate(agg),
    };

    expect(breakdown.services).toBe(2);
    expect(breakdown.terminal).toBe(8);
    expect(breakdown.total).toBe(10);
    expect(agg.terminal_revenue_gross).toBe(300);
  });
});
