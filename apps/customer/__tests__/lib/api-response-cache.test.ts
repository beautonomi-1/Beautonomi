import {
  responseCache,
  inflightRequests,
  clearApiCache,
  pruneResponseCache,
  evictProviderFromApiCache,
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

  describe("evictProviderFromApiCache", () => {
    const future = () => Date.now() + 60_000;

    it("drops discovery/list caches and provider-specific entries, keeping unrelated ones", () => {
      responseCache.set("u1::host::/api/public/home", { data: 1, error: null, expiresAt: future() });
      responseCache.set("u1::host::/api/public/search?q=hair", { data: 1, error: null, expiresAt: future() });
      responseCache.set("u1::host::/api/me/recently-viewed", { data: 1, error: null, expiresAt: future() });
      responseCache.set("u1::host::/api/me/wishlists/providers", { data: 1, error: null, expiresAt: future() });
      responseCache.set("u1::host::/api/public/providers/salon-x/services", { data: 1, error: null, expiresAt: future() });
      responseCache.set("u1::host::/api/me/bookings", { data: 1, error: null, expiresAt: future() });
      inflightRequests.set("u1::host::/api/public/home", Promise.resolve({ data: null, error: null }));
      inflightRequests.set("u1::host::/api/me/bookings", Promise.resolve({ data: null, error: null }));

      evictProviderFromApiCache(["prov-123", "salon-x"]);

      expect(responseCache.has("u1::host::/api/public/home")).toBe(false);
      expect(responseCache.has("u1::host::/api/public/search?q=hair")).toBe(false);
      expect(responseCache.has("u1::host::/api/me/recently-viewed")).toBe(false);
      expect(responseCache.has("u1::host::/api/me/wishlists/providers")).toBe(false);
      expect(responseCache.has("u1::host::/api/public/providers/salon-x/services")).toBe(false);
      // Unrelated cache survives.
      expect(responseCache.has("u1::host::/api/me/bookings")).toBe(true);
      expect(inflightRequests.has("u1::host::/api/public/home")).toBe(false);
      expect(inflightRequests.has("u1::host::/api/me/bookings")).toBe(true);
    });

    it("evicts an entry that contains the provider id even on a non-discovery path", () => {
      responseCache.set("u1::host::/api/some/custom/prov-123/extra", { data: 1, error: null, expiresAt: future() });
      evictProviderFromApiCache(["prov-123"]);
      expect(responseCache.has("u1::host::/api/some/custom/prov-123/extra")).toBe(false);
    });

    it("ignores empty/nullish identifiers but still flushes discovery surfaces", () => {
      responseCache.set("u1::host::/api/public/home", { data: 1, error: null, expiresAt: future() });
      responseCache.set("u1::host::/api/me/bookings", { data: 1, error: null, expiresAt: future() });
      evictProviderFromApiCache([null, undefined, "  "]);
      expect(responseCache.has("u1::host::/api/public/home")).toBe(false);
      expect(responseCache.has("u1::host::/api/me/bookings")).toBe(true);
    });
  });
});
