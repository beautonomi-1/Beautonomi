import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFrankfurterV2Batch, fetchFrankfurterPairRate } from "../frankfurter-reference-rate";

describe("frankfurter-reference-rate v2", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses v2 batch rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toContain("/v2/rates?");
        expect(init?.cache).toBe("no-store");
        return new Response(
          JSON.stringify([
            { date: "2026-09-10", base: "USD", quote: "ZAR", rate: 18.2 },
            { date: "2026-09-10", base: "USD", quote: "KES", rate: 129.5 },
          ]),
          { status: 200 },
        );
      }),
    );

    const rows = await fetchFrankfurterV2Batch("USD", ["ZAR", "KES"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].rate).toBe(18.2);
  });

  it("returns empty on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 })),
    );
    const rows = await fetchFrankfurterV2Batch("USD", ["ZAR"]);
    expect(rows).toEqual([]);
  });

  it("returns null on pair 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "not found" }), { status: 404 })),
    );
    const row = await fetchFrankfurterPairRate("USD", "ZAR");
    expect(row).toBeNull();
  });

  it("returns identity without HTTP", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const row = await fetchFrankfurterPairRate("ZAR", "ZAR");
    expect(row?.rate).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
