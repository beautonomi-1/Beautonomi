import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";

function parseInstant(input: Date | string): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * §Launch-audit 2026-04-18: legacy provider rows can store offset-style
 * timezones (e.g. "GMT+2"), which throw inside `formatInTimeZone` because
 * `date-fns-tz` ultimately hands them to `Intl.DateTimeFormat`. We
 * canonicalise to an IANA / Etc zone before formatting; on failure we
 * fall back to the platform default rather than surfacing a crash to
 * the UI / email template.
 */
function safeTimezone(timeZone: string | null | undefined): string {
  const normalised = normalizeProviderTimezone(timeZone);
  if (normalised) return normalised;
  const trimmed = timeZone?.trim();
  return trimmed || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
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
  const tz = safeTimezone(timeZone);
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
  const tz = safeTimezone(timeZone);
  try {
    return formatInTimeZone(d, tz, "h:mm a");
  } catch {
    return formatInTimeZone(d, DEFAULT_BOOKING_DISPLAY_TIMEZONE, "h:mm a");
  }
}

/**
 * Resolve display timezone: prefer explicit provider timezone
 * (normalised if it arrived as an offset-style string), else default SA.
 */
export function resolveBookingDisplayTimeZone(providerTimezone?: string | null): string {
  return safeTimezone(providerTimezone);
}
