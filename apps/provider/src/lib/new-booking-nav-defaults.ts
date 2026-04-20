import { format, isSameDay } from "date-fns";

/**
 * Default date/time for "New booking" / "Walk-in" deep links (dashboard, calendar FAB).
 * Uses the next 15-minute boundary in local wall time — matches calendar FAB logic.
 */

export function nextQuarterHourFrom(from: Date = new Date()): { dateYmd: string; timeHm: string } {
  const y = from.getFullYear();
  const mo = String(from.getMonth() + 1).padStart(2, "0");
  const da = String(from.getDate()).padStart(2, "0");
  const dateYmd = `${y}-${mo}-${da}`;
  const roundedMin = (Math.ceil(from.getMinutes() / 15) * 15) % 60;
  const roundedHour = from.getHours() + (Math.ceil(from.getMinutes() / 15) >= 4 ? 1 : 0);
  const timeHm = `${String(roundedHour).padStart(2, "0")}:${String(roundedMin).padStart(2, "0")}`;
  return { dateYmd, timeHm };
}

/**
 * Date/time when opening new booking from a calendar anchor day: same local day as "now"
 * uses the next quarter-hour; other days default to 09:00 on that day (availability UI snaps).
 */
export function newBookingScreenHrefFromCalendarDay(
  calendarDay: Date,
  opts?: { walkIn?: boolean; status?: string; locationId?: string },
  clock: Date = new Date(),
): string {
  let dateYmd: string;
  let timeHm: string;
  if (isSameDay(calendarDay, clock)) {
    ({ dateYmd, timeHm } = nextQuarterHourFrom(clock));
  } else {
    dateYmd = format(calendarDay, "yyyy-MM-dd");
    timeHm = "09:00";
  }
  const q = new URLSearchParams({ date: dateYmd, time: timeHm });
  if (opts?.walkIn) q.set("walk_in", "true");
  if (opts?.status?.trim()) q.set("status", opts.status.trim());
  const loc = opts?.locationId?.trim();
  if (loc) q.set("location_id", loc);
  return `/(app)/(tabs)/more/bookings/new?${q.toString()}`;
}

/** Expo-router path + query for new booking screen (today + next quarter-hour). */
export function newBookingScreenHref(opts?: { walkIn?: boolean; status?: string; locationId?: string }): string {
  return newBookingScreenHrefFromCalendarDay(new Date(), opts);
}
