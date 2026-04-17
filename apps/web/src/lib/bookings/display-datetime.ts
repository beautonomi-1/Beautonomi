import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

function parseInstant(input: Date | string): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Format a booking instant (`scheduled_at`, etc.) for display in the provider’s business timezone.
 * Uses IANA tz (e.g. Africa/Johannesburg); falls back to DEFAULT_BOOKING_DISPLAY_TIMEZONE.
 */
export function formatBookingDateInTimeZone(
  scheduledAt: Date | string | null | undefined,
  timeZone?: string | null,
): string {
  if (scheduledAt == null) return "";
  const d = parseInstant(scheduledAt);
  if (Number.isNaN(d.getTime())) return "";
  const tz = (timeZone && timeZone.trim()) || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  try {
    return formatInTimeZone(d, tz, "EEEE, MMMM d, yyyy");
  } catch {
    return formatInTimeZone(d, DEFAULT_BOOKING_DISPLAY_TIMEZONE, "EEEE, MMMM d, yyyy");
  }
}

/**
 * Time only (12-hour) in the same zone as `formatBookingDateInTimeZone`.
 */
export function formatBookingTimeInTimeZone(
  scheduledAt: Date | string | null | undefined,
  timeZone?: string | null,
): string {
  if (scheduledAt == null) return "";
  const d = parseInstant(scheduledAt);
  if (Number.isNaN(d.getTime())) return "";
  const tz = (timeZone && timeZone.trim()) || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  try {
    return formatInTimeZone(d, tz, "h:mm a");
  } catch {
    return formatInTimeZone(d, DEFAULT_BOOKING_DISPLAY_TIMEZONE, "h:mm a");
  }
}

/**
 * Resolve display timezone: prefer explicit provider timezone, else default SA.
 */
export function resolveBookingDisplayTimeZone(providerTimezone?: string | null): string {
  const t = providerTimezone?.trim();
  return t || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
}
