import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";

/**
 * Converts public availability slot selection (calendar day + HH:mm) into a UTC `Date`.
 * Slot strings from `/api/public/providers/.../availability` are wall-clock times in the
 * provider's business timezone — not UTC. Appending `Z` was incorrect and shifted display
 * (e.g. +2h in South Africa).
 *
 * §Launch-audit 2026-04-18: legacy provider rows can store offset-style
 * timezones like "GMT+2". `fromZonedTime` hands the TZ to `Intl` and
 * will throw a `RangeError` on such strings. We normalise first
 * (converts "GMT+2" → "Etc/GMT-2" — POSIX sign flip); if normalisation
 * fails we fall back to the platform default and re-attempt, and if
 * *that* still throws we return the instant parsed as UTC so the caller
 * never sees an unhandled exception.
 */
export function parseSelectedDatetimeInProviderTz(
  dateYmd: string,
  timeSlotHHMM: string,
  providerTimeZone?: string | null,
): Date {
  const tz =
    normalizeProviderTimezone(providerTimeZone) ??
    DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  const t = timeSlotHHMM.trim();
  const normalizedTime = t.length === 5 ? `${t}:00` : t;
  const isoLocal = `${dateYmd}T${normalizedTime}`;
  try {
    return fromZonedTime(isoLocal, tz);
  } catch {
    try {
      return fromZonedTime(isoLocal, DEFAULT_BOOKING_DISPLAY_TIMEZONE);
    } catch {
      return new Date(`${isoLocal}Z`);
    }
  }
}
