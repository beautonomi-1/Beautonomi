import {
  responseCache,
  inflightRequests,
  clearApiCache,
  pruneResponseCache,
} from "@/lib/api-response-cache";

describe("api-response-cache", () => {
  beforeEach(() => {
    clearApiCache();
  });

  it("clearApiCache empties both maps", () => {
    responseCache.set("k", { data: 1, error: null, expiresAt: Date.now() + 60_000 });
    inflightRequests.set("k2", Promise.resolve({ data: null, error: null }));
    clearApiCache();
    expect(responseCache.size).toBe(0);
    expect(inflightRequests.size).toBe(0);
  });

  it("pruneResponseCache removes expired entries", () => {
    const now = 1_000_000;
    responseCache.set("old", { data: null, error: "x", expiresAt: now - 1 });
    responseCache.set("fresh", { data: 2, error: null, expiresAt: now + 60_000 });
    pruneResponseCache(now);
    expect(responseCache.has("old")).toBe(false);
    expect(responseCache.get("fresh")?.data).toBe(2);
  });
});
