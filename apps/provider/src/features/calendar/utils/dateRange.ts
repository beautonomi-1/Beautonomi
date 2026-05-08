import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { normalizeCalendarWallClockLoose as normalizeCalendarTime } from "@/lib/provider-calendar-parity";

const CALENDAR_DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type CalendarDayKey = (typeof CALENDAR_DAY_KEYS)[number];

function timeStringToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

export interface StaffShift {
  date: string;
  team_member_id: string;
  start_time: string;
  end_time: string;
}

export interface StaffMemberWithHours {
  id: string;
  name: string;
  working_hours?: Record<string, { open?: string; close?: string; open_time?: string; close_time?: string; is_open?: boolean; closed?: boolean } | undefined> | null;
  [key: string]: unknown;
}

export function applyEffectiveShiftHours(
  members: StaffMemberWithHours[],
  shifts: StaffShift[] | null,
  dateFrom: string,
  dateTo: string,
  selectedStaffId: string,
): StaffMemberWithHours[] {
  if (shifts == null) return members;
  const rangeDates = datesInRange(dateFrom, dateTo);
  if (rangeDates.length === 0) return members;

  const dateToDayKey = new Map(
    rangeDates.map((date) => [date, CALENDAR_DAY_KEYS[parseISO(date).getDay()]] as const),
  );
  const byStaffDay = new Map<string, { open: string; close: string }>();

  for (const shift of shifts) {
    if (!shift.date || shift.date < dateFrom || shift.date > dateTo) continue;
    if (selectedStaffId !== "all" && shift.team_member_id !== selectedStaffId) continue;

    const dayKey = dateToDayKey.get(shift.date);
    const open = normalizeCalendarTime(shift.start_time);
    const close = normalizeCalendarTime(shift.end_time);
    if (!dayKey || !open || !close) continue;

    const key = `${shift.team_member_id}::${dayKey}`;
    const existing = byStaffDay.get(key);
    if (!existing) {
      byStaffDay.set(key, { open, close });
      continue;
    }
    byStaffDay.set(key, {
      open: timeStringToMinutes(open) < timeStringToMinutes(existing.open) ? open : existing.open,
      close: timeStringToMinutes(close) > timeStringToMinutes(existing.close) ? close : existing.close,
    });
  }

  return members.map((member) => {
    const workingHours: NonNullable<StaffMemberWithHours["working_hours"]> = { ...(member.working_hours ?? {}) };
    for (const [, dayKey] of dateToDayKey) {
      const shiftHours = byStaffDay.get(`${member.id}::${dayKey}`);
      if (!shiftHours) continue;
      const existing = workingHours[dayKey];
      const existingOpen = normalizeCalendarTime(existing?.open ?? existing?.open_time);
      const existingClose = normalizeCalendarTime(existing?.close ?? existing?.close_time);
      if (existing && existing.closed !== true && existing.is_open !== false && existingOpen && existingClose) {
        workingHours[dayKey] = {
          open: timeStringToMinutes(shiftHours.open) < timeStringToMinutes(existingOpen) ? shiftHours.open : existingOpen,
          close: timeStringToMinutes(shiftHours.close) > timeStringToMinutes(existingClose) ? shiftHours.close : existingClose,
          closed: false,
          is_open: true,
        };
      } else {
        workingHours[dayKey] = { ...shiftHours, closed: false, is_open: true };
      }
    }
    return { ...member, working_hours: workingHours };
  });
}

export function datesInRange(dateFrom: string, dateTo: string): string[] {
  const start = parseISO(dateFrom);
  const end = parseISO(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
  }
  return dates;
}

export function weekStartsInRange(dateFrom: string, dateTo: string): string[] {
  const start = parseISO(dateFrom);
  const end = parseISO(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const starts: string[] = [];
  for (
    let cursor = startOfWeek(start, { weekStartsOn: 1 });
    cursor <= end;
    cursor = addDays(cursor, 7)
  ) {
    starts.push(format(cursor, "yyyy-MM-dd"));
  }
  return starts;
}

export { CALENDAR_DAY_KEYS };
