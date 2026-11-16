/**
 * Shared admin reporting windows. Null/invalid timezone falls back to UTC so
 * Dashboard, Finance summary, and Gods Eye bucket the same instants.
 */

export type AdminPeriodBounds = {
  timeZone: string;
  startOfToday: Date;
  startOfWeek: Date;
  startOfMonth: Date;
  startOfPreviousMonth: Date;
  /** Inclusive end of the previous month (1ms before this month starts). */
  endOfPreviousMonth: Date;
};

type Wall = { year: number; month: number; day: number; hour: number; minute: number };

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveAdminTimeZone(timeZone: string | null | undefined): string {
  const trimmed = timeZone?.trim();
  if (trimmed && isValidTimeZone(trimmed)) return trimmed;
  return "UTC";
}

function wallInZone(date: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/** UTC instant of a wall-clock time in `timeZone`. */
export function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const seen = wallInZone(new Date(utcGuess), timeZone);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, 0);
  return new Date(utcGuess - (seenAsUtc - utcGuess));
}

function shiftCalendarDay(year: number, month: number, day: number, deltaDays: number): Wall {
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + deltaDays);
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
    hour: 0,
    minute: 0,
  };
}

export function adminPeriodBounds(now: Date, timeZone?: string | null): AdminPeriodBounds {
  const zone = resolveAdminTimeZone(timeZone);
  const wall = wallInZone(now, zone);
  const startOfToday = zonedWallToUtc(wall.year, wall.month, wall.day, 0, 0, zone);
  const startOfMonth = zonedWallToUtc(wall.year, wall.month, 1, 0, 0, zone);
  const prevMonthWall = shiftCalendarDay(wall.year, wall.month, 1, -1);
  const startOfPreviousMonth = zonedWallToUtc(prevMonthWall.year, prevMonthWall.month, 1, 0, 0, zone);
  const noon = zonedWallToUtc(wall.year, wall.month, wall.day, 12, 0, zone);
  const dow = noon.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekWall = shiftCalendarDay(wall.year, wall.month, wall.day, -daysFromMonday);
  const startOfWeek = zonedWallToUtc(weekWall.year, weekWall.month, weekWall.day, 0, 0, zone);
  return {
    timeZone: zone,
    startOfToday,
    startOfWeek,
    startOfMonth,
    startOfPreviousMonth,
    endOfPreviousMonth: new Date(startOfMonth.getTime() - 1),
  };
}
