/**
 * Portal result cache for /api/me/portal.
 *
 * Two layers, both scoped by userId to avoid wrong-app after an account switch:
 *   1. In-memory `fresh` cache (TTL = PORTAL_CACHE_MS). Lets the route gate skip
 *      the network entirely on a warm relaunch.
 *   2. Persisted "last known good" (AsyncStorage, TTL = PORTAL_PERSIST_MS). When
 *      the OS kills a backgrounded app the in-memory cache is gone, so on cold
 *      resume the gate would otherwise block on a network round-trip and, on a
 *      slow-waking radio, fall through to the "Taking longer than expected"
 *      timeout screen. The persisted value lets the gate render the last route
 *      immediately and re-verify in the background instead.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const PORTAL_CACHE_MS = 10 * 60 * 1000;
/** How long a persisted portal is trusted for the render-immediately fallback. */
export const PORTAL_PERSIST_MS = 30 * 24 * 60 * 60 * 1000;

const STORAGE_KEY = "beautonomi.portalCache.v1";

type PortalEntry = { portal: string; ts: number; userId: string };

let cache: PortalEntry | null = null;

let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function isExpired(entry: PortalEntry, ttlMs: number): boolean {
  return Date.now() - entry.ts >= ttlMs;
}

/** Load the persisted entry into memory once. Safe to await repeatedly. */
function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PortalEntry>;
        if (
          parsed &&
          typeof parsed.portal === "string" &&
          typeof parsed.ts === "number" &&
          typeof parsed.userId === "string"
        ) {
          // Only adopt into the in-memory cache if it's still within the fresh
          // TTL; otherwise it stays available via getPersistedPortal only.
          if (!cache && !isExpired(parsed as PortalEntry, PORTAL_CACHE_MS)) {
            cache = parsed as PortalEntry;
          }
          persisted = parsed as PortalEntry;
        }
      }
    } catch {
      // Corrupt / unavailable storage — fall back to network resolution.
    } finally {
      hydrated = true;
      hydrationPromise = null;
    }
  })();
  return hydrationPromise;
}

let persisted: PortalEntry | null = null;

// Warm the cache as early as possible so the gate's synchronous fast path can
// hit it on a warm relaunch.
void hydrate();

/** Synchronous fresh-cache read used to skip the network entirely. */
export function getCachedPortal(userId: string | undefined): string | null {
  if (!userId?.trim()) return null;
  if (cache && cache.userId === userId && !isExpired(cache, PORTAL_CACHE_MS)) {
    return cache.portal;
  }
  if (cache && cache.userId === userId && isExpired(cache, PORTAL_CACHE_MS)) {
    cache = null;
  }
  return null;
}

/**
 * Async "last known good" read for the render-immediately fallback. Returns the
 * persisted portal (within PORTAL_PERSIST_MS) and whether it is still fresh
 * (within PORTAL_CACHE_MS, i.e. safe to skip re-verification).
 */
export async function getPersistedPortal(
  userId: string | undefined,
): Promise<{ portal: string; fresh: boolean } | null> {
  if (!userId?.trim()) return null;
  await hydrate();
  const entry =
    cache && cache.userId === userId
      ? cache
      : persisted && persisted.userId === userId
        ? persisted
        : null;
  if (!entry) return null;
  if (isExpired(entry, PORTAL_PERSIST_MS)) return null;
  return { portal: entry.portal, fresh: !isExpired(entry, PORTAL_CACHE_MS) };
}

export function setCachedPortal(userId: string, portal: string): void {
  const entry: PortalEntry = { portal, ts: Date.now(), userId };
  cache = entry;
  persisted = entry;
  // Write-through; never block the caller on storage latency.
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry)).catch(() => {});
}

export function clearPortalCache(): void {
  cache = null;
  persisted = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
