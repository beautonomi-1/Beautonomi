/**
 * Shared GET response cache helpers for useApi + prefetchApi.
 * Cache keys must stay identical between prefetch and hook reads.
 */
import type { ApiError } from "@beautonomi/types";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getRuntimeMarketHost } from "@/config/public-env";
import {
  responseCache,
  inflightRequests,
  pruneResponseCache,
} from "@/lib/api-response-cache";

/** Prefetch entries expire quickly so destination screens still revalidate on mount. */
export const PREFETCH_STALE_TIME_MS = 45_000;

/** Money / ledger surfaces revalidate on every screen focus. */
export const MONEY_SURFACE_STALE_TIME_MS = 30_000;

interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  expiresAt: number;
}

export function buildApiCacheKey(userId: string | undefined, path: string): string {
  const scope = userId ?? "_anon";
  const host = getRuntimeMarketHost().trim().toLowerCase() || "default";
  return `${scope}::${host}::${path}`;
}

/** Paths that must never be prefetched (payment / checkout state). */
const PREFETCH_BLOCKLIST = [
  "/api/provider/sales",
  "/api/payments/",
  "paystack",
  "checkout",
  "group-bookings",
  "terminal",
] as const;

export function isPrefetchBlockedPath(path: string): boolean {
  const lower = path.toLowerCase();
  return PREFETCH_BLOCKLIST.some((needle) => lower.includes(needle));
}

/**
 * Payment / checkout state, which must always be read live — a stale entry here
 * can show a charge as unpaid after it settled. Deliberately narrower than the
 * prefetch blocklist: sales and group bookings are merely not worth warming,
 * but they are still cached-first money surfaces.
 */
const NEVER_CACHE_NEEDLES = ["/api/payments/", "paystack", "checkout", "terminal"] as const;

export function isNeverCachePath(path: string): boolean {
  const lower = path.toLowerCase();
  return NEVER_CACHE_NEEDLES.some((needle) => lower.includes(needle));
}

/**
 * Warm the in-memory GET cache for a path (same key format as useApi).
 * Skips when a fresh entry already exists. Uses short expiry for prefetched rows.
 */
export async function prefetchApi(
  path: string,
  options?: { userId?: string; timeoutMs?: number },
): Promise<void> {
  if (!path?.trim() || isPrefetchBlockedPath(path)) return;

  const cacheKey = buildApiCacheKey(options?.userId, path);
  const now = Date.now();
  const existing = responseCache.get(cacheKey) as CacheEntry<unknown> | undefined;
  if (existing && existing.expiresAt > now && existing.data != null) {
    return;
  }

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    await inflight;
    return;
  }

  const requestPromise = (async () => {
    const result = await api.get<unknown>(
      path,
      options?.timeoutMs && options.timeoutMs > 0 ? { timeout: options.timeoutMs } : undefined,
    );
    if (result.error) {
      const e = result.error as ApiError;
      return {
        data: null,
        error: getApiErrorMessage(e, "Request failed"),
        errorCode: e.code ?? null,
      };
    }
    return { data: result.data, error: null, errorCode: null };
  })();

  inflightRequests.set(cacheKey, requestPromise);

  try {
    const payload = await requestPromise;
    if (!payload.error && payload.data != null) {
      responseCache.set(cacheKey, {
        ...payload,
        expiresAt: Date.now() + PREFETCH_STALE_TIME_MS,
      });
      pruneResponseCache(Date.now());
    }
  } finally {
    inflightRequests.delete(cacheKey);
  }
}
