/**
 * Resolves a location operating-hours day-of-week entry into a synthetic
 * "shift" used by the provider shifts API when no `staff_schedules` row
 * exists. Accepts both stored shapes:
 *   Format A: { is_open, open_time, close_time }
 *   Format B: { open, close, closed }
 *
 * Returning `null` means "the location is closed (or not set) on that day"
 * and the shifts API should not synthesize a row for it.
 */

export interface LocationHoursDay {
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  open?: string;
  close?: string;
  closed?: boolean;
  [key: string]: unknown;
}

export interface ResolvedLocationHours {
  start_time: string;
  end_time: string;
}

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

export function resolveLocationHoursDay(
  dayData: LocationHoursDay | null | undefined,
): ResolvedLocationHours | null {
  if (!dayData || typeof dayData !== "object") return null;

  // Closed when either Format A or Format B says so.
  const isClosed = dayData.closed === true || dayData.is_open === false;
  if (isClosed) return null;

  const start = (dayData.open_time ?? dayData.open ?? DEFAULT_OPEN)
    .toString()
    .substring(0, 5);
  const end = (dayData.close_time ?? dayData.close ?? DEFAULT_CLOSE)
    .toString()
    .substring(0, 5);

  return { start_time: start, end_time: end };
}
