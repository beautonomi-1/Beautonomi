import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

/**
 * Converts public availability slot selection (calendar day + HH:mm) into a UTC `Date`.
 * Slot strings from `/api/public/providers/.../availability` are wall-clock times in the
 * provider's business timezone — not UTC. Appending `Z` was incorrect and shifted display
 * (e.g. +2h in South Africa).
 */
export function parseSelectedDatetimeInProviderTz(
  dateYmd: string,
  timeSlotHHMM: string,
  providerTimeZone?: string | null,
): Date {
  const tz = (providerTimeZone && providerTimeZone.trim()) || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  const t = timeSlotHHMM.trim();
  const normalizedTime = t.length === 5 ? `${t}:00` : t;
  const isoLocal = `${dateYmd}T${normalizedTime}`;
  return fromZonedTime(isoLocal, tz);
}
