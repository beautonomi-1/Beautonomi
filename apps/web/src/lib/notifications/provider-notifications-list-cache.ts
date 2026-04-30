/**
 * Short-TTL cache for GET /api/provider/notifications list payloads.
 * Must be invalidated on any mutation so badge/count endpoints don't return stale totals.
 */
const NOTIFICATIONS_LIST_CACHE_TTL_MS = 5000;
const MAX_NOTIFICATIONS_CACHE_ENTRIES = 400;

export type ProviderNotificationsListPayload = {
  notifications: unknown[];
  total_unread: number;
};

export const notificationsListCache = new Map<
  string,
  { expiresAt: number; payload: ProviderNotificationsListPayload }
>();

export function pruneNotificationsListCache(now: number): void {
  for (const [key, entry] of notificationsListCache.entries()) {
    if (entry.expiresAt <= now) {
      notificationsListCache.delete(key);
    }
  }
  if (notificationsListCache.size <= MAX_NOTIFICATIONS_CACHE_ENTRIES) return;
  const overflow = notificationsListCache.size - MAX_NOTIFICATIONS_CACHE_ENTRIES;
  let removed = 0;
  for (const key of notificationsListCache.keys()) {
    notificationsListCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

/** Clear all cached list variants for a user (after read/delete/mark-all). */
export function invalidateProviderNotificationsListCache(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of notificationsListCache.keys()) {
    if (key.startsWith(prefix)) notificationsListCache.delete(key);
  }
}

export { NOTIFICATIONS_LIST_CACHE_TTL_MS };
