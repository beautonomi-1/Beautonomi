/**
 * Helpers for converting `provider_locations.working_hours` JSON into the
 * day-row shape rendered by the operating-hours editor.
 *
 * Hours are stored in two shapes depending on the writer:
 *   Format A (canonical):  { is_open, open_time, close_time, breaks }
 *   Format B (onboarding wizard / web editor): { open, close, closed }
 *
 * Both must be accepted on read so values saved during onboarding (Format B)
 * render correctly in the post-onboarding settings screen instead of being
 * silently replaced with the editor's defaults.
 */

export interface BreakTime {
  start: string;
  end: string;
}

export interface DayHours {
  day: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
  breaks: BreakTime[];
}

export interface RawDayHours {
  // Format A
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  // Format B
  open?: string;
  close?: string;
  closed?: boolean;
  breaks?: BreakTime[];
}

export const OPERATING_HOURS_DAYS: readonly string[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_OPEN = "08:00";
const DEFAULT_CLOSE = "18:00";

export function mapWorkingHoursToSchedule(
  workingHours: Record<string, RawDayHours> | null | undefined,
  days: readonly string[] = OPERATING_HOURS_DAYS,
): DayHours[] {
  const wh = workingHours ?? {};
  return days.map((day) => {
    const key = day.toLowerCase();
    const dh = wh[key];
    const explicitlyClosed = dh?.closed === true || dh?.is_open === false;
    const isOpen = dh ? !explicitlyClosed : true;
    const openTime = dh?.open_time ?? dh?.open ?? DEFAULT_OPEN;
    const closeTime = dh?.close_time ?? dh?.close ?? DEFAULT_CLOSE;
    return {
      day,
      is_open: isOpen,
      open_time: openTime,
      close_time: closeTime,
      breaks: Array.isArray(dh?.breaks) ? dh.breaks : [],
    };
  });
}

export function scheduleToWorkingHours(
  schedule: DayHours[],
): Record<string, { is_open: boolean; open_time: string; close_time: string; breaks: BreakTime[] }> {
  const result: Record<
    string,
    { is_open: boolean; open_time: string; close_time: string; breaks: BreakTime[] }
  > = {};
  for (const d of schedule) {
    result[d.day.toLowerCase()] = {
      is_open: d.is_open,
      open_time: d.open_time,
      close_time: d.close_time,
      breaks: d.breaks,
    };
  }
  return result;
}
