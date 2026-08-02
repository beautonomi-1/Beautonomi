import { formatDateKeyInTimeZone, wallClockInTimeZone } from "@beautonomi/utils";

interface NewBookingHrefOptions {
  walkIn?: boolean;
  status?: string;
  locationId?: string;
  staffId?: string;
  timeZone?: string | null;
}

/**
 * Default date/time for "New booking" / "Walk-in" deep links (dashboard, calendar FAB).
 * Uses the next 15-minute boundary in provider wall time when a timezone is supplied.
 */
export function nextQuarterHourFrom(
  from: Date = new Date(),
  timeZone?: string | null,
): { dateYmd: string; timeHm: string } {
  const { minute } = wallClockInTimeZone(from, timeZone);
  const minutesToAdd = (15 - (minute % 15)) % 15;
  const rounded = minutesToAdd > 0 ? new Date(from.getTime() + minutesToAdd * 60_000) : from;
  const { hour, minute: roundedMinute } = wallClockInTimeZone(rounded, timeZone);
  const dateYmd = formatDateKeyInTimeZone(rounded, timeZone);
  const timeHm = `${String(hour).padStart(2, "0")}:${String(roundedMinute).padStart(2, "0")}`;
  return { dateYmd, timeHm };
}

/**
 * Date/time when opening new booking from a calendar anchor day: same local day as "now"
 * uses the next quarter-hour; other days default to 09:00 on that day (availability UI snaps).
 */
export function newBookingScreenHrefFromCalendarDay(
  calendarDay: Date,
  opts?: NewBookingHrefOptions,
  clock: Date = new Date(),
): string {
  let dateYmd: string;
  let timeHm: string;
  const timeZone = opts?.timeZone ?? null;
  if (formatDateKeyInTimeZone(calendarDay, timeZone) === formatDateKeyInTimeZone(clock, timeZone)) {
    ({ dateYmd, timeHm } = nextQuarterHourFrom(clock, timeZone));
  } else {
    dateYmd = formatDateKeyInTimeZone(calendarDay, timeZone);
    timeHm = "09:00";
  }
  const q = new URLSearchParams({ date: dateYmd, time: timeHm });
  if (opts?.walkIn) q.set("walk_in", "true");
  if (opts?.status?.trim()) q.set("status", opts.status.trim());
  const loc = opts?.locationId?.trim();
  if (loc) q.set("location_id", loc);
  const staff = opts?.staffId?.trim();
  if (staff) q.set("staff_id", staff);
  return `/(app)/(tabs)/bookings/new?${q.toString()}`;
}

/** Expo-router path + query for new booking screen (today + next quarter-hour). */
export function newBookingScreenHref(opts?: NewBookingHrefOptions): string {
  return newBookingScreenHrefFromCalendarDay(new Date(), opts);
}
