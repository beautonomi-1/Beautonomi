import { addDays, addMonths, format, parseISO, isValid } from "date-fns";

export type SimpleFrequency = "daily" | "weekly" | "biweekly" | "monthly";

/**
 * Next calendar occurrence (YYYY-MM-DD) after `lastBookingDate`, or the first occurrence (`startDate`) when none booked yet.
 */
export function nextRecurringOccurrenceDate(params: {
  startDate: string;
  lastBookingDate: string | null | undefined;
  frequency?: string | null;
  recurrenceRule?: string | null;
}): string | null {
  const start = parseISO(params.startDate);
  if (!isValid(start)) return null;

  if (!params.lastBookingDate) {
    return format(start, "yyyy-MM-dd");
  }

  const last = parseISO(params.lastBookingDate);
  if (!isValid(last)) return format(start, "yyyy-MM-dd");

  const freq = (params.frequency || "").toLowerCase() as SimpleFrequency | "";
  if (freq === "daily" || freq === "weekly" || freq === "biweekly" || freq === "monthly") {
    if (freq === "daily") return format(addDays(last, 1), "yyyy-MM-dd");
    if (freq === "weekly") return format(addDays(last, 7), "yyyy-MM-dd");
    if (freq === "biweekly") return format(addDays(last, 14), "yyyy-MM-dd");
    return format(addMonths(last, 1), "yyyy-MM-dd");
  }

  const rr = (params.recurrenceRule || "").toUpperCase();
  if (rr.includes("FREQ=MONTHLY")) {
    const m = rr.match(/INTERVAL=(\d+)/);
    const n = m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
    return format(addMonths(last, n), "yyyy-MM-dd");
  }
  if (rr.includes("FREQ=WEEKLY")) {
    const m = rr.match(/INTERVAL=(\d+)/);
    const weeks = m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
    return format(addDays(last, 7 * weeks), "yyyy-MM-dd");
  }
  if (rr.includes("FREQ=DAILY")) {
    const m = rr.match(/INTERVAL=(\d+)/);
    const days = m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
    return format(addDays(last, days), "yyyy-MM-dd");
  }

  return format(addDays(last, 7), "yyyy-MM-dd");
}

export function isDateOnOrBeforeEnd(occurrenceYmd: string, endDateYmd: string | null | undefined): boolean {
  if (!endDateYmd) return true;
  const a = parseISO(occurrenceYmd);
  const b = parseISO(endDateYmd);
  if (!isValid(a) || !isValid(b)) return true;
  return a.getTime() <= b.getTime();
}

/** Next occurrence on or after `todayYmd` (skips past dates while series is still valid). */
export function nextUpcomingOccurrenceYmd(
  row: {
    start_date: string;
    last_booking_date?: string | null;
    frequency?: string | null;
    recurrence_rule?: string | null;
    end_date?: string | null;
  },
  todayYmd: string
): string | null {
  let last: string | null =
    typeof row.last_booking_date === "string" && row.last_booking_date
      ? row.last_booking_date
      : null;

  let next = nextRecurringOccurrenceDate({
    startDate: row.start_date,
    lastBookingDate: last,
    frequency: row.frequency,
    recurrenceRule: row.recurrence_rule,
  });
  if (!next) return null;

  const end = row.end_date ?? null;
  let guard = 0;
  while (next && next < todayYmd && isDateOnOrBeforeEnd(next, end) && guard < 366) {
    last = next;
    next = nextRecurringOccurrenceDate({
      startDate: row.start_date,
      lastBookingDate: last,
      frequency: row.frequency,
      recurrenceRule: row.recurrence_rule,
    });
    guard++;
  }

  if (!next || !isDateOnOrBeforeEnd(next, end)) return null;
  return next;
}
