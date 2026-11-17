import { describe, expect, it } from "vitest";
import { addMoney } from "@beautonomi/utils";
import { isProviderEarningsRefundComponent } from "@/lib/ledger/refund-components";

/** Mirror of analytics route top-provider netting (provider-scoped refund legs). */
function netProviderRevenue(
  rows: Array<{
    provider_id?: string | null;
    transaction_type?: string | null;
    refund_component?: string | null;
    net?: number | null;
    amount?: number | null;
  }>,
): Record<string, number> {
  const providerRevenue: Record<string, number> = {};
  for (const row of rows) {
    const pid = row.provider_id != null ? String(row.provider_id) : "";
    if (!pid) continue;
    const type = String(row.transaction_type ?? "");
    if (type === "refund" && !isProviderEarningsRefundComponent(row.refund_component)) {
      continue;
    }
    const amt = Number(row.net ?? row.amount ?? 0);
    providerRevenue[pid] = addMoney(providerRevenue[pid] || 0, amt);
  }
  return providerRevenue;
}

describe("analytics top providers netting", () => {
  it("reduces provider totals with provider-side refund legs", () => {
    const rows = [
      { provider_id: "p1", transaction_type: "provider_earnings", net: 400 },
      { provider_id: "p1", transaction_type: "tip", net: 22.5 },
      { provider_id: "p1", transaction_type: "refund", refund_component: "provider_earnings", net: -250 },
      { provider_id: "p2", transaction_type: "provider_earnings", net: 187.5 },
      { provider_id: "p2", transaction_type: "refund", refund_component: "provider_earnings", net: -187.5 },
      {
        provider_id: "p1",
        transaction_type: "refund",
        refund_component: "platform_fee",
        net: -15,
      },
    ];
    const nets = netProviderRevenue(rows);
    expect(nets.p1).toBe(172.5);
    expect(nets.p2).toBe(0);
  });
});