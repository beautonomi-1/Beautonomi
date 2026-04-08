/**
 * Server-side checks that a booking/hold window does not overlap provider calendar
 * blocks (time_blocks, availability_blocks, staff time off / days off).
 * Aligns with GET /api/public/providers/[slug]/availability busy-interval rules.
 */

import { addDays, format, startOfDay } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderCalendarBlockCheck = {
  providerId: string;
  /** at_salon location; omit or null for at_home / unknown */
  locationId?: string | null;
  staffId: string | null;
  startAt: Date;
  endAt: Date;
};

function intervalsOverlap(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0 < b1 && a1 > b0;
}

/** Local calendar YYYY-MM-DD (same basis as `new Date(\`\${date}T...\`)` in public availability). */
function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDaysBetweenInclusive(start: Date, end: Date): string[] {
  const a = startOfDay(start);
  const b = startOfDay(end);
  const out: string[] = [];
  for (let cur = a; cur <= b; cur = addDays(cur, 1)) {
    out.push(format(cur, "yyyy-MM-dd"));
  }
  return out;
}

function timeBlockLocalInterval(dateStr: string, startTime: string, endTime: string): { start: Date; end: Date } {
  const startPart = String(startTime ?? "00:00").slice(0, 5);
  const endPart = String(endTime ?? "00:00").slice(0, 5);
  return {
    start: new Date(`${dateStr}T${startPart}:00`),
    end: new Date(`${dateStr}T${endPart}:00`),
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

  // ── time_blocks (date + local time, same construction as public availability) ──
  const minYmd = ymdLocal(startAt);
  const maxYmd = ymdLocal(endAt);
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
    const { start: bs, end: be } = timeBlockLocalInterval(d, tb.start_time as string, tb.end_time as string);
    if (intervalsOverlap(startAt, endAt, bs, be)) {
      return { blocked: true, reason: "Overlaps time block" };
    }
  }

  // ── Staff full-day unavailability (staff_time_off, staff_days_off) ─────
  if (staffId) {
    const days = localDaysBetweenInclusive(startAt, endAt);
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
