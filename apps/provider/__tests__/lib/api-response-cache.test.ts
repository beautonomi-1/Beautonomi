import {
  responseCache,
  inflightRequests,
  invalidateServicesCache,
  invalidateApiCacheForPath,
} from "@/lib/api-response-cache";

describe("invalidateServicesCache", () => {
  beforeEach(() => {
    responseCache.clear();
    inflightRequests.clear();
  });

  it("clears list and detail service cache keys", () => {
    responseCache.set("user::host::/api/provider/services?include_inactive=true", {
      data: [{ id: "1" }],
      error: null,
      errorCode: null,
      expiresAt: Date.now() + 60_000,
    });
    responseCache.set("user::host::/api/provider/services/abc-123", {
      data: { id: "abc-123" },
      error: null,
      errorCode: null,
      expiresAt: Date.now() + 60_000,
    });
    responseCache.set("user::host::/api/provider/products?limit=10", {
      data: [],
      error: null,
      errorCode: null,
      expiresAt: Date.now() + 60_000,
    });

    invalidateServicesCache();

    expect(responseCache.has("user::host::/api/provider/services?include_inactive=true")).toBe(false);
    expect(responseCache.has("user::host::/api/provider/services/abc-123")).toBe(false);
    expect(responseCache.has("user::host::/api/provider/products?limit=10")).toBe(true);
  });

  it("does not clear list cache when invalidating a single service path", () => {
    responseCache.set("user::host::/api/provider/services?include_inactive=true", {
      data: [{ id: "1" }],
      error: null,
      errorCode: null,
      expiresAt: Date.now() + 60_000,
    });
    responseCache.set("user::host::/api/provider/services/abc-123", {
      data: { id: "abc-123" },
      error: null,
      errorCode: null,
      expiresAt: Date.now() + 60_000,
    });

    invalidateApiCacheForPath("/api/provider/services/abc-123");

    expect(responseCache.has("user::host::/api/provider/services?include_inactive=true")).toBe(true);
    expect(responseCache.has("user::host::/api/provider/services/abc-123")).toBe(false);
  });
});
