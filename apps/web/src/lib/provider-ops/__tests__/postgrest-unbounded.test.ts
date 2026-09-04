import { describe, it, expect, vi } from "vitest";
import {
  fetchAllPaged,
  chunkIds,
  fetchInIdChunks,
  unwrapEmbedded,
  isPostgrestRangeUnsatisfiable,
} from "../postgrest-unbounded";

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

  it("treats PostgREST PGRST103 as end of pages instead of throwing", async () => {
    const fetchPage = vi.fn(async (from: number) => {
      if (from === 0) {
        return {
          data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })),
          error: null as unknown,
        };
      }
      return { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" } };
    });
    await expect(fetchAllPaged(fetchPage)).resolves.toHaveLength(PAGE_SIZE);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe("isPostgrestRangeUnsatisfiable", () => {
  it("recognizes PGRST103, HTTP 416, and range message text", () => {
    expect(isPostgrestRangeUnsatisfiable({ code: "PGRST103" })).toBe(true);
    expect(isPostgrestRangeUnsatisfiable({ code: "416" })).toBe(true);
    expect(isPostgrestRangeUnsatisfiable({ message: "Requested range not satisfiable" })).toBe(true);
    expect(isPostgrestRangeUnsatisfiable({ code: "42703" })).toBe(false);
    expect(isPostgrestRangeUnsatisfiable(null)).toBe(false);
  });
});

describe("chunkIds", () => {
  it("splits ids into fixed-size chunks", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns no chunks for an empty list", () => {
    expect(chunkIds([], 10)).toEqual([]);
  });
  it("defaults to POSTGREST_IN_CHUNK when size is omitted", () => {
    const ids = Array.from({ length: 151 }, (_, i) => i);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(150);
    expect(chunks[1]).toEqual([150]);
  });
});

describe("fetchInIdChunks", () => {
  it("fetches each id slice and concatenates rows", async () => {
    const seen: string[][] = [];
    const rows = await fetchInIdChunks(
      ["a", "b", "c"],
      async (slice) => {
        seen.push(slice);
        return { data: slice.map((id) => ({ id })) };
      },
      { chunkSize: 2 },
    );
    expect(seen).toEqual([["a", "b"], ["c"]]);
    expect(rows).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("skips a failed chunk unless throwOnError is set", async () => {
    await expect(
      fetchInIdChunks(["a"], async () => ({ data: null, error: new Error("boom") })),
    ).resolves.toEqual([]);
    await expect(
      fetchInIdChunks(["a"], async () => ({ data: null, error: new Error("boom") }), {
        throwOnError: true,
      }),
    ).rejects.toThrow("boom");
  });
});

describe("unwrapEmbedded", () => {
  it("unwraps an embedded object or single-element array", () => {
    expect(unwrapEmbedded<{ id: number }>({ rel: { id: 1 } }, "rel")).toEqual({ id: 1 });
    expect(unwrapEmbedded<{ id: number }>({ rel: [{ id: 2 }] }, "rel")).toEqual({ id: 2 });
    expect(unwrapEmbedded({ rel: null }, "rel")).toBeUndefined();
  });
});
