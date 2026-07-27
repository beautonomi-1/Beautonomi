import {
  buildApiCacheKey,
  isNeverCachePath,
  isPrefetchBlockedPath,
  PREFETCH_STALE_TIME_MS,
  MONEY_SURFACE_STALE_TIME_MS,
} from "@/lib/api-cache-helpers";

describe("api-cache-helpers", () => {
  it("builds stable scoped cache keys", () => {
    expect(buildApiCacheKey("user-1", "/api/provider/dashboard")).toContain("user-1");
    expect(buildApiCacheKey("user-1", "/api/provider/dashboard")).toContain("/api/provider/dashboard");
    expect(buildApiCacheKey(undefined, "/api/public/home")).toContain("_anon");
  });

  it("blocks prefetch for payment and checkout paths", () => {
    expect(isPrefetchBlockedPath("/api/provider/sales")).toBe(true);
    expect(isPrefetchBlockedPath("/api/payments/paystack/verify")).toBe(true);
    expect(isPrefetchBlockedPath("/api/provider/bookings?checkout=1")).toBe(true);
    expect(isPrefetchBlockedPath("group-bookings/abc/pay")).toBe(true);
    expect(isPrefetchBlockedPath("/api/provider/dashboard")).toBe(false);
    expect(isPrefetchBlockedPath("/api/provider/conversations")).toBe(false);
  });

  it("never caches payment and checkout state", () => {
    expect(isNeverCachePath("/api/payments/paystack/verify")).toBe(true);
    expect(isNeverCachePath("/api/provider/bookings?checkout=1")).toBe(true);
    expect(isNeverCachePath("/api/provider/terminal/status")).toBe(true);
  });

  it("keeps money surfaces cacheable even though they are not worth prefetching", () => {
    // These are cached-first screens with focus revalidation; only proactive
    // warming is skipped, so the two lists must not be conflated.
    for (const path of [
      "/api/provider/sales-history?range=today",
      "/api/provider/group-bookings",
      "/api/provider/finance",
      "/api/provider/payouts",
      "/api/provider/transactions",
    ]) {
      expect(isNeverCachePath(path)).toBe(false);
    }
    expect(isPrefetchBlockedPath("/api/provider/sales-history?range=today")).toBe(true);
    expect(isPrefetchBlockedPath("/api/provider/group-bookings")).toBe(true);
  });

  it("uses short prefetch TTL and shorter money-surface stale time", () => {
    expect(PREFETCH_STALE_TIME_MS).toBeLessThanOrEqual(60_000);
    expect(MONEY_SURFACE_STALE_TIME_MS).toBeLessThanOrEqual(60_000);
    expect(MONEY_SURFACE_STALE_TIME_MS).toBeLessThan(PREFETCH_STALE_TIME_MS * 10);
  });
});
