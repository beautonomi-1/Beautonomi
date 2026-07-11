import { describe, it, expect } from "@jest/globals";

type Totals = {
  total_gross: number;
  total_provider_net: number;
  total_platform_fee: number;
  total_commission: number;
};

function resolveSalesHistoryStats(
  salesPayload: { totals?: Totals; total?: number } | null,
  sales: { gross_total: number; provider_net: number }[]
) {
  const t = salesPayload?.totals;
  const hasRangeTotals = Boolean(t);
  return {
    count: salesPayload?.total ?? sales.length,
    hasRangeTotals,
    gross: hasRangeTotals ? t!.total_gross : null,
    net: hasRangeTotals ? t!.total_provider_net : null,
  };
}

describe("sales history stats", () => {
  it("does not present page sums as range totals when server totals missing", () => {
    const sales = [
      { gross_total: 50, provider_net: 40 },
      { gross_total: 30, provider_net: 25 },
    ];
    const stats = resolveSalesHistoryStats({ total: 10 }, sales);
    expect(stats.hasRangeTotals).toBe(false);
    expect(stats.gross).toBeNull();
    expect(stats.net).toBeNull();
    expect(stats.count).toBe(10);
  });

  it("uses server range totals when present", () => {
    const stats = resolveSalesHistoryStats(
      {
        total: 2,
        totals: { total_gross: 80, total_provider_net: 65, total_platform_fee: 5, total_commission: 10 },
      },
      []
    );
    expect(stats.hasRangeTotals).toBe(true);
    expect(stats.gross).toBe(80);
    expect(stats.net).toBe(65);
  });
});
