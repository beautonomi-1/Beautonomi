/**
 * In-memory GET response cache for useApi (dedupe + stale-while-revalidate).
 * Scoped separately from the provider app. Keys include user id once signed in
 * so a different account on the same device cannot read cached /api/me/* payloads.
 */

const MAX_CACHE_ENTRIES = 200;

interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  expiresAt: number;
}

export const responseCache = new Map<string, CacheEntry<unknown>>();
export const inflightRequests = new Map<
  string,
  Promise<{ data: unknown | null; error: string | null }>
>();

export function clearApiCache(): void {
  responseCache.clear();
  inflightRequests.clear();
}

/** Drop cached support-ticket GETs (any query). Use after CSAT or ticket mutations so list rows stay in sync. */
export function invalidateSupportTicketsListCache(): void {
  const needles = ["/api/me/support-tickets", "/api/provider/support-tickets"];
  for (const key of responseCache.keys()) {
    if (needles.some((needle) => key.includes(needle))) responseCache.delete(key);
  }
  for (const key of inflightRequests.keys()) {
    if (needles.some((needle) => key.includes(needle))) inflightRequests.delete(key);
  }
}

/** Discovery/list GETs that may contain a provider summary in their payload. */
const PROVIDER_DISCOVERY_NEEDLES = [
  "/api/public/home",
  "/api/public/search",
  "/api/public/providers",
  "/api/explore/collections",
  "/api/me/recently-viewed",
  "/api/me/wishlists",
] as const;

/**
 * Drop cached discovery/list GETs plus any cached read tied to a specific
 * provider, so a provider that became unavailable (deleted/suspended/banned)
 * stops resurfacing from stale caches. Pass the provider id and/or slug.
 * Safe to call with no identifiers — it still flushes the discovery surfaces.
 */
export function evictProviderFromApiCache(
  identifiers: ReadonlyArray<string | null | undefined> = [],
): void {
  const ids = identifiers
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  const shouldEvict = (key: string): boolean =>
    PROVIDER_DISCOVERY_NEEDLES.some((needle) => key.includes(needle)) ||
    ids.some((id) => key.includes(id));

  for (const key of responseCache.keys()) {
    if (shouldEvict(key)) responseCache.delete(key);
  }
  for (const key of inflightRequests.keys()) {
    if (shouldEvict(key)) inflightRequests.delete(key);
  }
}

export function pruneResponseCache(now: number): void {
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }

  if (responseCache.size <= MAX_CACHE_ENTRIES) return;

  const overflow = responseCache.size - MAX_CACHE_ENTRIES;
  let removed = 0;
  for (const key of responseCache.keys()) {
    responseCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}
