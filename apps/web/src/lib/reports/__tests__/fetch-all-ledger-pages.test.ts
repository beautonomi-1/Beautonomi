import { describe, it, expect, vi } from "vitest";
import { fetchAllLedgerPages, LEDGER_PAGE_SIZE } from "../fetch-all-ledger-pages";

/** Fake Supabase query whose `.range(from,to)` serves slices of a backing array. */
function pageableQuery(total: number) {
  const backing = Array.from({ length: total }, (_, i) => ({ id: i }));
  const range = vi.fn(async (from: number, to: number) => ({
    data: backing.slice(from, to + 1),
    error: null,
  }));
  return { query: { range }, range };
}

describe("fetchAllLedgerPages", () => {
  it("fetches every row across pages for a >8000-row ledger (cap-removal regression)", async () => {
    const { query, range } = pageableQuery(9000);
    const rows = await fetchAllLedgerPages(query, 50_000);
    expect(rows).toHaveLength(9000);
    // 9000 rows / 1000 page size = 9 full pages; loop stops when a short page returns.
    expect(range.mock.calls.length).toBeGreaterThanOrEqual(9);
  });

  it("stops early when a page is shorter than the page size", async () => {
    const { query, range } = pageableQuery(1500);
    const rows = await fetchAllLedgerPages(query, 50_000);
    expect(rows).toHaveLength(1500);
    expect(range).toHaveBeenCalledTimes(2);
  });

  it("never exceeds the maxRows safety bound", async () => {
    const { query } = pageableQuery(100_000);
    const rows = await fetchAllLedgerPages(query, 3 * LEDGER_PAGE_SIZE);
    expect(rows).toHaveLength(3 * LEDGER_PAGE_SIZE);
  });

  it("propagates query errors", async () => {
    const query = { range: vi.fn(async () => ({ data: null, error: new Error("boom") })) };
    await expect(fetchAllLedgerPages(query)).rejects.toThrow("boom");
  });

  it("keeps the last full page when the next range is PGRST103", async () => {
    const range = vi.fn(async (from: number) => {
      if (from === 0) {
        return {
          data: Array.from({ length: LEDGER_PAGE_SIZE }, (_, i) => ({ id: i })),
          error: null,
        };
      }
      return { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } };
    });
    await expect(fetchAllLedgerPages({ range }, 50_000)).resolves.toHaveLength(LEDGER_PAGE_SIZE);
    expect(range).toHaveBeenCalledTimes(2);
  });
});
