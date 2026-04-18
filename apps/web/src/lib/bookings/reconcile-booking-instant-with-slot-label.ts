import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import { parseSelectedDatetimeInProviderTz } from "@/lib/bookings/parse-selected-datetime-in-provider-tz";

/** Normalize "3:00" / "03:00" to HH:mm for comparison. */
function normalizeHhMm(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t.trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * Prefer the availability engine's ISO instant when it matches the calendar's
 * wall-clock label in the provider zone. If the engine fell back to UTC (invalid
 * provider timezone) the ISO instant is wrong — re-derive from YMD + HH:mm + TZ.
 */
export function reconcileBookingInstantWithSlotLabel(
  slotStartIso: string | null | undefined,
  dateYmd: string,
  timeSlotHHMM: string,
  providerTimeZone?: string | null,
): Date {
  const tz = normalizeProviderTimezone(providerTimeZone) ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  const labelHm = normalizeHhMm(timeSlotHHMM);

  if (!slotStartIso) {
    return parseSelectedDatetimeInProviderTz(dateYmd, timeSlotHHMM, providerTimeZone);
  }

  const fromEngine = new Date(slotStartIso);
  if (Number.isNaN(fromEngine.getTime())) {
    return parseSelectedDatetimeInProviderTz(dateYmd, timeSlotHHMM, providerTimeZone);
  }

  let wallHm: string;
  let wallYmd: string;
  try {
    wallHm = formatInTimeZone(fromEngine, tz, "HH:mm");
    wallYmd = formatInTimeZone(fromEngine, tz, "yyyy-MM-dd");
  } catch {
    return parseSelectedDatetimeInProviderTz(dateYmd, timeSlotHHMM, providerTimeZone);
  }

  if (normalizeHhMm(wallHm) === labelHm && wallYmd === dateYmd) {
    return fromEngine;
  }

  return parseSelectedDatetimeInProviderTz(dateYmd, timeSlotHHMM, providerTimeZone);
}
