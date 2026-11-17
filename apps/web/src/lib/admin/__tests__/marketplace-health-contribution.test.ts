import { describe, expect, it } from "vitest";
import { sumPlatformContributionByCustomer } from "../marketplace-health-contribution";
import type { FinanceLedgerRow } from "../finance-ledger-tenant";

describe("sumPlatformContributionByCustomer", () => {
  it("uses platform take plus service fees per customer, not gateway fees or provider refund legs", () => {
    const rows: FinanceLedgerRow[] = [
      {
        booking_id: "b1",
        transaction_type: "platform_fee",
        amount: 10,
        net: 10,
      },
      {
        booking_id: "b1",
        transaction_type: "refund",
        refund_component: "provider_earnings",
        net: -80,
        metadata: { refund_tender: "store_credit" },
      },
      {
        booking_id: "b2",
        transaction_type: "platform_fee",
        amount: 5,
        net: 5,
      },
    ];
  const map = new Map([
      ["b1", "c1"],
      ["b2", "c2"],
    ]);
    const out = sumPlatformContributionByCustomer(rows, map);
    expect(out.get("c1")).toBe(10);
    expect(out.get("c2")).toBe(5);
    const total = [...out.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(15);
  });
});