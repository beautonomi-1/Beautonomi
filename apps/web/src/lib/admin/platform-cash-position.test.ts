import { describe, expect, it } from "vitest";
import { buildPlatformCashPosition } from "./platform-cash-position";
import { aggregateFinanceLedgerRows } from "./aggregate-finance-ledger-rows";
import type { FinanceLedgerRow } from "./finance-ledger-tenant";

describe("platform-cash-position", () => {
  it("store_credit refunds do not reduce platform-held card cash", () => {
    const rows: FinanceLedgerRow[] = [
      { transaction_type: "payment", amount: 100, fees: 5.16, net: 0 },
      { transaction_type: "payment", amount: 150, fees: 7.66, net: 0 },
      { transaction_type: "payment", amount: 150, fees: 7.41, net: 0 },
      { transaction_type: "platform_fee", amount: 15, net: 15 },
      { transaction_type: "tip", amount: 22.5, net: 22.5 },
      { transaction_type: "wallet_topup", amount: 100, net: 100 },
      {
        transaction_type: "refund",
        refund_component: "provider_earnings",
        net: -100,
        metadata: { refund_tender: "store_credit" },
      },
    ];
    const agg = aggregateFinanceLedgerRows(rows);
    const position = buildPlatformCashPosition({ agg, walletTopupCashCollected: 100 });
    expect(position.refunds_store_credit).toBe(100);
    expect(position.refunds_platform_cash_out).toBe(0);
    expect(position.refunds_platform_cash_out).toBe(0);
    expect(position.net_platform_cash).toBeGreaterThan(500);
  });
});