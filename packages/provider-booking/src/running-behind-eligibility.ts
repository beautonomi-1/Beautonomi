/**
 * Which confirmed bookings should receive a "running behind" broadcast today.
 */

export type RunningBehindBookingRow = {
  status?: string | null;
  scheduled_at?: string | null;
};

export function isConfirmedBookingStatus(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "confirmed";
}

/** True when this booking is confirmed and still in the future. */
export function isEligibleForRunningBehindNotify(
  booking: RunningBehindBookingRow,
  nowMs: number = Date.now(),
): boolean {
  if (!isConfirmedBookingStatus(booking.status)) return false;
  const raw = booking.scheduled_at;
  if (!raw) return false;
  const t = new Date(String(raw)).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= nowMs;
}

export function anyEligibleForRunningBehindNotify(
  bookings: RunningBehindBookingRow[],
  nowMs: number = Date.now(),
): boolean {
  return bookings.some((b) => isEligibleForRunningBehindNotify(b, nowMs));
}
