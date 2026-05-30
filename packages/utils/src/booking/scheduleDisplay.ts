import { formatBusinessDayYYYYMMDD, normalizeProviderTimezone } from "../dates";

/** Default IANA zone when provider has no timezone (SA marketplace default). */
export const DEFAULT_BOOKING_DISPLAY_TIMEZONE = "Africa/Johannesburg";

export type BookingScheduleLine = {
  scheduled_start_at?: string | null;
};

export type BookingScheduleRow = {
  scheduled_at?: string | null;
  services?: BookingScheduleLine[] | null;
  status?: string | null;
  db_status?: string | null;
};

const TERMINAL_STRIP_STATUSES = new Set(["cancelled", "canceled", "no_show"]);

const PENDING_QUEUE_STATUSES = new Set([
  "pending",
  "pending_payment",
  "waiting",
  "checked_in",
]);

function parseInstant(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * Authoritative schedule instant for list/strip filtering: earliest service line,
 * falling back to booking.scheduled_at.
 */
export function effectiveScheduleAt(booking: BookingScheduleRow): Date | null {
  const lineTimes = (booking.services ?? [])
    .map((s) => parseInstant(s.scheduled_start_at))
    .filter((t) => Number.isFinite(t));
  if (lineTimes.length > 0) {
    return new Date(Math.min(...lineTimes));
  }
  const header = parseInstant(booking.scheduled_at);
  return Number.isFinite(header) ? new Date(header) : null;
}

export function resolveBookingDisplayTimezone(providerTimezone?: string | null): string {
  return normalizeProviderTimezone(providerTimezone) ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
}

/** Calendar day key (yyyy-MM-dd) for a booking in the provider business timezone. */
export function bookingScheduleYmd(
  booking: BookingScheduleRow,
  providerTimezone?: string | null,
): string | null {
  const at = effectiveScheduleAt(booking);
  if (!at) return null;
  return formatBusinessDayYYYYMMDD(at, resolveBookingDisplayTimezone(providerTimezone));
}

export function bookingLifecycleStatus(booking: Pick<BookingScheduleRow, "status" | "db_status">): string {
  const raw = (booking.db_status?.trim() || booking.status || "").trim().toLowerCase();
  if (raw === "booked") return "confirmed";
  if (raw === "started") return "in_progress";
  return raw;
}

export function isTerminalScheduleBooking(booking: Pick<BookingScheduleRow, "status" | "db_status">): boolean {
  return TERMINAL_STRIP_STATUSES.has(bookingLifecycleStatus(booking));
}

export function isPendingOrQueueBooking(booking: Pick<BookingScheduleRow, "status" | "db_status">): boolean {
  return PENDING_QUEUE_STATUSES.has(bookingLifecycleStatus(booking));
}

/** Days on each side of anchor for the provider app date strip (±30). */
export const PROVIDER_BOOKINGS_STRIP_HALF_DAYS = 30;
