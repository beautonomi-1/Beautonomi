/** Timestamps a status change must record, for every location type. */
export function missingBookingStatusTimestamp(
  status: string | undefined,
  existing: { completed_at?: unknown; cancelled_at?: unknown },
  nowIso: string,
): { completed_at?: string; cancelled_at?: string } {
  if (status === "completed" && !existing.completed_at) return { completed_at: nowIso };
  if ((status === "cancelled" || status === "no_show") && !existing.cancelled_at) {
    return { cancelled_at: nowIso };
  }
  return {};
}
