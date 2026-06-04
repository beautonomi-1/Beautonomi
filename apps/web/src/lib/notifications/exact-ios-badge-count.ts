/** Clamp server unread count for OneSignal `ios_badgeCount` (SetTo). Allows 0 after mark-all-read. */
export function exactIosBadgeCount(unread: number): number {
  if (!Number.isFinite(unread)) return 0;
  return Math.min(999_999, Math.max(0, Math.floor(unread)));
}
