/**
 * In-memory GET response cache for useApi (dedupe + stale-while-revalidate).
 * Scoped separately from the customer app. Keys include user id once signed in
 * so a different account on the same device cannot read cached /api/me/* payloads.
 */

const MAX_CACHE_ENTRIES = 200;

interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  expiresAt: number;
}

export const responseCache = new Map<string, CacheEntry<unknown>>();
export const inflightRequests = new Map<
  string,
  Promise<{ data: unknown | null; error: string | null; errorCode: string | null }>
>();

export function clearApiCache(): void {
  responseCache.clear();
  inflightRequests.clear();
}

/** Drop cached GETs for `/api/me/support-tickets` (any query). Use after CSAT or ticket mutations so list rows stay in sync. */
export function invalidateSupportTicketsListCache(): void {
  const needle = "/api/me/support-tickets";
  for (const key of responseCache.keys()) {
    if (key.includes(needle)) responseCache.delete(key);
  }
  for (const key of inflightRequests.keys()) {
    if (key.includes(needle)) inflightRequests.delete(key);
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
