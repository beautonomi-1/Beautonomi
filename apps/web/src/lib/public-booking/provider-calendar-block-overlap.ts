/**
 * Server-side checks that a booking/hold window does not overlap provider calendar
 * blocks (time_blocks, availability_blocks, staff time off / days off).
 * Aligns with GET /api/public/providers/[slug]/availability busy-interval rules.
 *
 * §Fix 2026-05: wall-clock blocks (`time_blocks.date` + `start_time`/`end_time`) must be
 * interpreted in the provider's IANA timezone (same as `combineDateAndTime` in the slot
 * engine). Previously Node's local timezone was used for YMD keys and `Date` parsing,
 * causing false positives/negatives vs the availability grid (incl. ~1h drift on UTC hosts).
 */

import { addDays, format, parse } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import {
  combineDateAndTime,
  expandRecurringPattern,
  normalizeProviderTimezone,
} from "@/lib/availability/time-utils";

export type ProviderCalendarBlockCheck = {
  providerId: string;
  /** at_salon location; omit or null for at_home / unknown */
  locationId?: string | null;
  staffId: string | null;
  startAt: Date;
  endAt: Date;
  /**
   * Raw `providers.timezone` when already loaded by caller (avoids extra round-trip).
   * When omitted, loaded from `providers`.
   */
  providerTimezoneRaw?: string | null;
};

function intervalsOverlap(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0 < b1 && a1 > b0;
}

/** Effective IANA zone for interpreting calendar dates and wall-clock blocks. */
function effectiveIanaForProvider(rawTz: string | null | undefined): string | null {
  return normalizeProviderTimezone(rawTz ?? undefined);
}

function ymdForInstantInZone(d: Date, ianaTz: string | null): string {
  if (ianaTz) {
    try {
      return formatInTimeZone(d, ianaTz, "yyyy-MM-dd");
    } catch {
      /* fall through */
    }
  }
  try {
    return formatInTimeZone(d, DEFAULT_BOOKING_DISPLAY_TIMEZONE, "yyyy-MM-dd");
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

/** Civil calendar days from startAt through endAt as labeled in the provider zone. */
function bookingCalendarDaysInclusive(startAt: Date, endAt: Date, ianaTz: string | null): string[] {
  const minYmd = ymdForInstantInZone(startAt, ianaTz);
  const maxYmd = ymdForInstantInZone(endAt, ianaTz);
  const out: string[] = [];
  let cur = parse(minYmd, "yyyy-MM-dd", new Date());
  const end = parse(maxYmd, "yyyy-MM-dd", new Date());
  while (cur <= end) {
    out.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return out;
}

function timeBlockIntervalInProviderZone(
  dateStr: string,
  startTime: string,
  endTime: string,
  ianaTz: string | null,
): { start: Date; end: Date } {
  const startPart = String(startTime ?? "00:00").slice(0, 5);
  const endPart = String(endTime ?? "00:00").slice(0, 5);
  const wallStart = `${startPart}:00`;
  const wallEnd = `${endPart}:00`;
  return {
    start: combineDateAndTime(dateStr, wallStart, ianaTz ?? undefined),
    end: combineDateAndTime(dateStr, wallEnd, ianaTz ?? undefined),
  };
}

/**
 * Returns true if the window should be rejected for booking/hold (overlaps a hard block).
 */
export async function isProviderCalendarWindowBlocked(
  supabase: SupabaseClient,
  opts: ProviderCalendarBlockCheck,
): Promise<{ blocked: boolean; reason?: string }> {
  const { providerId, locationId, staffId, startAt, endAt } = opts;
  if (!(endAt > startAt)) return { blocked: false };

  let rawTz = opts.providerTimezoneRaw;
  if (rawTz === undefined) {
    const { data: prow } = await supabase.from("providers").select("timezone").eq("id", providerId).maybeSingle();
    rawTz = (prow as { timezone?: string | null } | null)?.timezone ?? null;
  }
  const ianaTz = effectiveIanaForProvider(rawTz ?? null);

  const startIso = startAt.toISOString();
  const endIso = endAt.toISOString();

  const appliesToStaff = (blockStaffId: string | null | undefined): boolean => {
    if (!staffId) {
      return blockStaffId == null;
    }
    return blockStaffId == null || blockStaffId === staffId;
  };

  const appliesToLocation = (blockLocationId: string | null | undefined): boolean => {
    if (!locationId) return true;
    if (!blockLocationId) return true;
    return blockLocationId === locationId;
  };

  // ── availability_blocks (datetime) ───────────────────────────────────────
  const { data: availRows, error: availErr } = await supabase
    .from("availability_blocks")
    .select("id, start_at, end_at, staff_id, location_id")
    .eq("provider_id", providerId)
    .gt("end_at", startIso)
    .lt("start_at", endIso);

  if (availErr) {
    console.error("availability_blocks overlap check:", availErr);
    return { blocked: true, reason: "Calendar block check failed" };
  }

  for (const row of availRows || []) {
    if (!appliesToStaff(row.staff_id)) continue;
    if (!appliesToLocation(row.location_id)) continue;
    const b0 = new Date(row.start_at as string);
    const b1 = new Date(row.end_at as string);
    if (intervalsOverlap(startAt, endAt, b0, b1)) {
      return { blocked: true, reason: "Overlaps availability block" };
    }
  }

  // ── time_blocks (date + local time in provider zone) ─────────────────────
  const minYmd = ymdForInstantInZone(startAt, ianaTz);
  const maxYmd = ymdForInstantInZone(endAt, ianaTz);
  const { data: tbRows, error: tbErr } = await supabase
    .from("time_blocks")
    .select("id, staff_id, date, start_time, end_time")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .gte("date", minYmd)
    .lte("date", maxYmd);

  if (tbErr) {
    console.error("time_blocks overlap check:", tbErr);
    return { blocked: true, reason: "Calendar block check failed" };
  }

  for (const tb of tbRows || []) {
    if (!appliesToStaff(tb.staff_id)) continue;
    const d = typeof tb.date === "string" ? tb.date : minYmd;
    const { start: bs, end: be } = timeBlockIntervalInProviderZone(d, tb.start_time as string, tb.end_time as string, ianaTz);
    if (intervalsOverlap(startAt, endAt, bs, be)) {
      return { blocked: true, reason: "Overlaps time block" };
    }
  }

  // ── Recurring time_blocks whose origin date predates the booking window ──
  const { data: recurringTbRows, error: recurringTbErr } = await supabase
    .from("time_blocks")
    .select("id, staff_id, date, start_time, end_time, is_recurring, recurring_pattern")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .eq("is_recurring", true)
    .lt("date", minYmd);

  if (recurringTbErr) {
    console.error("recurring time_blocks overlap check:", recurringTbErr);
    return { blocked: true, reason: "Calendar block check failed" };
  }

  if (recurringTbRows && recurringTbRows.length > 0) {
    const bookingDays = bookingCalendarDaysInclusive(startAt, endAt, ianaTz);
    for (const tb of recurringTbRows) {
      if (!appliesToStaff(tb.staff_id)) continue;
      const originDateStr = typeof tb.date === "string" ? tb.date : minYmd;
      const originDate = parse(`${originDateStr}T12:00:00`, "yyyy-MM-dd'T'HH:mm:ss", new Date());
      const originDayOfWeek = originDate.getDay();

      for (const day of bookingDays) {
        const targetDate = parse(`${day}T12:00:00`, "yyyy-MM-dd'T'HH:mm:ss", new Date());
        let applies = false;
        if (tb.recurring_pattern) {
          applies = expandRecurringPattern(
            tb.recurring_pattern as Parameters<typeof expandRecurringPattern>[0],
            originDateStr,
            day,
          );
        } else {
          applies = targetDate.getDay() === originDayOfWeek && targetDate >= originDate;
        }
        if (!applies) continue;

        const { start: bs, end: be } = timeBlockIntervalInProviderZone(day, tb.start_time as string, tb.end_time as string, ianaTz);
        if (intervalsOverlap(startAt, endAt, bs, be)) {
          return { blocked: true, reason: "Overlaps recurring time block" };
        }
      }
    }
  }

  // ── Staff full-day unavailability (staff_time_off, staff_days_off) ─────
  if (staffId) {
    const days = bookingCalendarDaysInclusive(startAt, endAt, ianaTz);
    if (days.length === 0) return { blocked: false };

    const minDay = days[0];
    const maxDay = days[days.length - 1];

    const { data: dayOffRows, error: dayOffErr } = await supabase
      .from("staff_days_off")
      .select("date")
      .eq("provider_id", providerId)
      .eq("staff_id", staffId)
      .gte("date", minDay)
      .lte("date", maxDay)
      .or("is_approved.is.null,is_approved.eq.true");

    if (dayOffErr && dayOffErr.code !== "42P01") {
      console.error("staff_days_off overlap check:", dayOffErr);
      return { blocked: true, reason: "Calendar block check failed" };
    }

    const dayOffSet = new Set((dayOffRows || []).map((r: { date: string }) => r.date));
    for (const d of days) {
      if (dayOffSet.has(d)) {
        return { blocked: true, reason: "Staff day off" };
      }
    }

    const { data: timeOffRows, error: timeOffErr } = await supabase
      .from("staff_time_off")
      .select("start_date, end_date, status")
      .eq("provider_id", providerId)
      .eq("staff_id", staffId)
      .lte("start_date", maxDay)
      .gte("end_date", minDay);

    if (timeOffErr && timeOffErr.code !== "42P01") {
      console.error("staff_time_off overlap check:", timeOffErr);
      return { blocked: true, reason: "Calendar block check failed" };
    }

    for (const d of days) {
      for (const row of timeOffRows || []) {
        if (row.status === "denied") continue;
        const sd = row.start_date as string;
        const ed = row.end_date as string;
        if (d >= sd && d <= ed) {
          return { blocked: true, reason: "Staff time off" };
        }
      }
    }
  }

  return { blocked: false };
}
