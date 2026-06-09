import { describe, expect, it, vi } from "vitest";
import { getProviderRevenue } from "../revenue-helpers";
import { LEDGER_PAGE_SIZE } from "../fetch-all-ledger-pages";

function mockSupabaseWithLedgerRows(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `tx-${i}`,
    transaction_type: "provider_earnings",
    amount: 10,
    net: 10,
    booking_id: `b-${i % 50}`,
    product_order_id: null,
    created_at: "2026-01-15T12:00:00.000Z",
    provider_id: "provider-1",
  }));

  const range = vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));

  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => ({ range }),
  };

  return { supabase: { from: () => chain } as never, range };
}

describe("getProviderRevenue", () => {
  it("paginates finance_transactions across PostgREST pages (no silent 1000-row cap)", async () => {
    const { supabase, range } = mockSupabaseWithLedgerRows(2500);
    const result = await getProviderRevenue(
      supabase,
      "provider-1",
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-31T23:59:59.999Z"),
    );

    expect(result.totalRevenue).toBe(25000);
    expect(range.mock.calls.length).toBeGreaterThanOrEqual(Math.ceil(2500 / LEDGER_PAGE_SIZE));
  });
});
