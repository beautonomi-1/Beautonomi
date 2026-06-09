import { describe, it, expect, vi } from "vitest";
import { fetchAllPaged, chunkIds, unwrapEmbedded } from "../postgrest-unbounded";

const PAGE_SIZE = 1000;

/** Fake PostgREST page fetcher whose `(from, to)` serves inclusive slices of a backing array. */
function pagedFetcher(total: number) {
  const backing = Array.from({ length: total }, (_, i) => ({ id: i }));
  const fetchPage = vi.fn(async (from: number, to: number) => ({
    data: backing.slice(from, to + 1),
    error: null as unknown,
  }));
  return { fetchPage };
}

describe("fetchAllPaged", () => {
  it("fetches every row across pages when unbounded (preserves existing callers)", async () => {
    const { fetchPage } = pagedFetcher(2500);
    const rows = await fetchAllPaged(fetchPage);
    expect(rows).toHaveLength(2500);
    // 2500 / 1000 = 3 pages (1000, 1000, 500); stops on the short final page.
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("stops early when a page is shorter than the page size", async () => {
    const { fetchPage } = pagedFetcher(1500);
    const rows = await fetchAllPaged(fetchPage);
    expect(rows).toHaveLength(1500);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops at maxRows instead of loading the entire table (dashboard perf fix)", async () => {
    const { fetchPage } = pagedFetcher(100_000);
    const maxRows = 3 * PAGE_SIZE;
    const rows = await fetchAllPaged(fetchPage, maxRows);
    expect(rows).toHaveLength(maxRows);
    // Exactly 3 page reads — never pages past the cap into the rest of the 100k-row table.
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("never returns more than maxRows even when the cap is not a multiple of the page size", async () => {
    const { fetchPage } = pagedFetcher(100_000);
    const maxRows = 2500;
    const rows = await fetchAllPaged(fetchPage, maxRows);
    expect(rows).toHaveLength(2500);
    // Last page is shrunk to land exactly on the cap (1000, 1000, 500).
    const lastCall = fetchPage.mock.calls.at(-1);
    expect(lastCall).toEqual([2000, 2499]);
  });

  it("returns all rows when the table is smaller than maxRows", async () => {
    const { fetchPage } = pagedFetcher(42);
    const rows = await fetchAllPaged(fetchPage, 50_000);
    expect(rows).toHaveLength(42);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("propagates fetch errors", async () => {
    const fetchPage = vi.fn(async () => ({ data: null, error: new Error("boom") }));
    await expect(fetchAllPaged(fetchPage)).rejects.toThrow("boom");
  });
});

describe("chunkIds", () => {
  it("splits ids into fixed-size chunks", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns no chunks for an empty list", () => {
    expect(chunkIds([], 10)).toEqual([]);
  });
});

describe("unwrapEmbedded", () => {
  it("unwraps an embedded object or single-element array", () => {
    expect(unwrapEmbedded<{ id: number }>({ rel: { id: 1 } }, "rel")).toEqual({ id: 1 });
    expect(unwrapEmbedded<{ id: number }>({ rel: [{ id: 2 }] }, "rel")).toEqual({ id: 2 });
    expect(unwrapEmbedded({ rel: null }, "rel")).toBeUndefined();
  });
});
