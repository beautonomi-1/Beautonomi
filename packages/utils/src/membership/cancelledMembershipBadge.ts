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
  const status = String(args.status ?? "").toLowerCase();
  if (status !== "cancelled" && !args.cancelled_at) return false;
  return !isCancelledMembershipBadgeStale(args.cancelled_at, args.nowMs);
}
