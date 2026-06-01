/** Days after cancellation before the provider "Cancelled" badge is hidden. */
export const MEMBERSHIP_CANCELLED_BADGE_TTL_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isCancelledMembershipBadgeStale(
  cancelledAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!cancelledAt) return false;
  const t = new Date(cancelledAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t > MEMBERSHIP_CANCELLED_BADGE_TTL_DAYS * MS_PER_DAY;
}

export function shouldShowCancelledMembershipBadge(args: {
  status: string | null | undefined;
  cancelled_at: string | null | undefined;
  nowMs?: number;
}): boolean {
  // §Provider-launch (audit 2026-06): the "Cancelled" pill is meant to be
  // a transient cue (TTL above), not a permanent label. A cancelled row
  // with no `cancelled_at` anchor has no date to age against, so it used
  // to linger in perpetuity on the provider clients list — misleading
  // providers about clients who lapsed long ago. Require the timestamp so
  // the TTL always applies; legacy / manually-edited rows without it simply
  // don't surface the transient badge (the live cancel flow always stamps
  // `cancelled_at`, so genuine recent cancellations are unaffected).
  if (!args.cancelled_at) return false;
  return !isCancelledMembershipBadgeStale(args.cancelled_at, args.nowMs);
}
