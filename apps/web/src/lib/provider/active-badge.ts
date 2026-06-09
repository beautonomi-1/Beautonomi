/**
 * Badge expiry guard for public-facing surfaces.
 *
 * Tier badges carry a `badge_expires_at` maintenance window. The DB renews it while
 * the provider stays eligible and a daily sweep (`expire_provider_badges`) clears it
 * otherwise, but public reads happen far more often than the sweep — so we also guard
 * at read time to guarantee an expired badge never displays, even in the window between
 * expiry and the next sweep/event.
 */

/** True when a badge's maintenance window has elapsed. A null/empty expiry means "no expiry" (active). */
export function isBadgeExpired(badgeExpiresAt: string | null | undefined): boolean {
  if (!badgeExpiresAt) return false;
  const expiresAtMs = new Date(badgeExpiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs <= Date.now();
}

/** Returns the badge only if it is still within its maintenance window, otherwise null. */
export function resolveActiveBadge<T>(
  badge: T | null | undefined,
  badgeExpiresAt: string | null | undefined,
): T | null {
  if (!badge) return null;
  if (isBadgeExpired(badgeExpiresAt)) return null;
  return badge;
}
