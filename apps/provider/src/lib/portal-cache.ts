/** In-memory portal result for /api/me/portal — must be scoped by user to avoid wrong-app after account switch. */
export const PORTAL_CACHE_MS = 10 * 60 * 1000;

let cache: { portal: string; ts: number; userId: string } | null = null;

export function getCachedPortal(userId: string | undefined): string | null {
  if (!userId?.trim()) return null;
  if (cache && cache.userId === userId && Date.now() - cache.ts < PORTAL_CACHE_MS) {
    return cache.portal;
  }
  cache = null;
  return null;
}

export function setCachedPortal(userId: string, portal: string): void {
  cache = { portal, ts: Date.now(), userId };
}

export function clearPortalCache(): void {
  cache = null;
}
