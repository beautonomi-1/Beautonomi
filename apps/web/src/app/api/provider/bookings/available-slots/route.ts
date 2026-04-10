import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";
import { resolveWorkingHoursDayForSingleStaffOrSyntheticSolo } from "@/lib/provider-booking/resolve-working-hours-single-staff-or-synthetic";
import { expandRecurringPattern } from "@/lib/availability/time-utils";

const SLOT_START_H = 6;
const SLOT_END_H = 22;
const SLOT_INTERVAL_MIN = 15;

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
function dayKeyFromDate(dateStr: string): (typeof DAY_KEYS)[number] {
  const d = new Date(dateStr + "T12:00:00").getDay();
  return DAY_KEYS[d];
}

type WorkingHoursDay = {
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  breaks?: { start: string; end: string }[];
};

function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function getSlotTimes(): string[] {
  const slots: string[] = [];
  for (let h = SLOT_START_H; h <= SLOT_END_H; h++) {
    for (let m = 0; m < 60; m += SLOT_INTERVAL_MIN) {
      if (h === SLOT_END_H && m > 0) break;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

/** Generate HH:mm slot times between openMin and closeMin (step 15), excluding break ranges. */
function getSlotTimesInRange(openMin: number, closeMin: number, breakRanges: Array<{ start: number; end: number }>): string[] {
  const slots: string[] = [];
  for (let startMin = openMin; startMin + 15 <= closeMin; startMin += SLOT_INTERVAL_MIN) {
    const slotEndMin = startMin + 15;
    const inBreak = breakRanges.some((br) => startMin < br.end && slotEndMin > br.start);
    if (!inBreak) {
      const h = Math.floor(startMin / 60);
      const m = startMin % 60;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

/**
 * GET /api/provider/bookings/available-slots?date=YYYY-MM-DD&duration_minutes=60&staff_ids=id1,id2&location_id=...
 * Returns time slot strings (HH:mm) that are available for the given date considering:
 * - Existing bookings (non-cancelled)
 * - Time blocks (breaks, time off)
 * Staff/location filter applied when provided.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const sp = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const dateStr = sp.get("date");
    const durationMinutes = Math.max(15, Math.min(480, parseInt(sp.get("duration_minutes") || "60", 10)));
    const staffIdsParam = sp.get("staff_ids");
    const locationId = sp.get("location_id");

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return handleApiError(new Error("date is required (YYYY-MM-DD)"), "VALIDATION_ERROR", 400);
    }

    const staffIds = staffIdsParam ? staffIdsParam.split(",").filter(Boolean) : [];
    const dayKey = dayKeyFromDate(dateStr);

    // Working hours: when single staff or location provided, restrict slots to open/close and exclude breaks
    let openMin = SLOT_START_H * 60;
    let closeMin = (SLOT_END_H + 1) * 60 - 1;
    const breakRanges: Array<{ start: number; end: number }> = [];
    if (staffIds.length === 1) {
      const wh = await resolveWorkingHoursDayForSingleStaffOrSyntheticSolo(
        supabaseAdmin,
        providerId,
        staffIds[0],
        dayKey
      );

      if (wh && wh.is_open !== false && wh.open_time && wh.close_time) {
        const o = parseTimeToMinutes(wh.open_time);
        const c = parseTimeToMinutes(wh.close_time);
        if (o !== null && c !== null && c > o) {
          openMin = o;
          closeMin = c;
        }
        for (const br of wh.breaks ?? []) {
          const bs = parseTimeToMinutes(br.start);
          const be = parseTimeToMinutes(br.end);
          if (bs !== null && be !== null && be > bs) breakRanges.push({ start: bs, end: be });
        }
      }
    } else if (locationId) {
      const { data: loc } = await supabaseAdmin
        .from("provider_locations")
        .select("id, working_hours")
        .eq("id", locationId)
        .eq("provider_id", providerId)
        .single();
      const wh = (loc?.working_hours as Record<string, WorkingHoursDay> | null)?.[dayKey];
      if (wh && wh.is_open !== false && wh.open_time && wh.close_time) {
        const o = parseTimeToMinutes(wh.open_time);
        const c = parseTimeToMinutes(wh.close_time);
        if (o !== null && c !== null && c > o) {
          openMin = o;
          closeMin = c;
        }
        for (const br of wh.breaks ?? []) {
          const bs = parseTimeToMinutes(br.start);
          const be = parseTimeToMinutes(br.end);
          if (bs !== null && be !== null && be > bs) breakRanges.push({ start: bs, end: be });
        }
      }
    }

    const slotTimes =
      openMin !== SLOT_START_H * 60 || closeMin < (SLOT_END_H + 1) * 60 - 1 || breakRanges.length > 0
        ? getSlotTimesInRange(openMin, closeMin, breakRanges)
        : getSlotTimes();
    const available: string[] = [];

    // Fetch all bookings for that day with per-service start/end so we block by actual duration per staff
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, booking_services(duration_minutes, staff_id, scheduled_start_at, scheduled_end_at)")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", `${dateStr}T00:00:00`)
      .lte("scheduled_at", `${dateStr}T23:59:59`);
    if (locationId) bookingsQuery = bookingsQuery.eq("location_id", locationId);
    const { data: dayBookings } = await bookingsQuery;

    // Fetch time blocks for that day (date-matched)
    const { data: dateTimeBlocks } = await supabaseAdmin
      .from("time_blocks")
      .select("id, staff_id, date, start_time, end_time, is_active")
      .eq("provider_id", providerId)
      .eq("date", dateStr)
      .eq("is_active", true);

    // Fetch recurring time blocks whose origin date is before today
    const { data: recurringTimeBlocks } = await supabaseAdmin
      .from("time_blocks")
      .select("id, staff_id, date, start_time, end_time, is_active, is_recurring, recurring_pattern")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .eq("is_recurring", true)
      .lt("date", dateStr);

    const expandedRecurring = (recurringTimeBlocks || [])
      .filter((block: any) => {
        const originDate = new Date(`${block.date}T12:00:00`);
        const targetDate = new Date(`${dateStr}T12:00:00`);
        if (targetDate < originDate) return false;
        if (block.recurring_pattern) {
          return expandRecurringPattern(block.recurring_pattern, block.date, dateStr);
        }
        return targetDate.getDay() === originDate.getDay();
      })
      .map((block: any) => ({ ...block, date: dateStr }));

    const timeBlocks = [...(dateTimeBlocks || []), ...expandedRecurring];

    // Fetch staff days off and time off
    const staffIdsForPto = staffIds.length > 0 ? staffIds : [];
    let staffDaysOff: string[] = [];
    if (staffIdsForPto.length > 0) {
      const { data: daysOffRows } = await supabaseAdmin
        .from("staff_days_off")
        .select("staff_id")
        .eq("provider_id", providerId)
        .eq("date", dateStr)
        .in("staff_id", staffIdsForPto)
        .or("is_approved.is.null,is_approved.eq.true");
      staffDaysOff = (daysOffRows || []).map((r: any) => r.staff_id);

      const { data: timeOffRows } = await supabaseAdmin
        .from("staff_time_off")
        .select("staff_id")
        .eq("provider_id", providerId)
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .in("staff_id", staffIdsForPto)
        .not("status", "eq", "denied");
      for (const row of timeOffRows || []) {
        if (row.staff_id && !staffDaysOff.includes(row.staff_id)) {
          staffDaysOff.push(row.staff_id);
        }
      }
    }

    // Fetch availability_blocks overlapping this day (provider-level breaks/unavailable)
    const startOfDayIso = `${dateStr}T00:00:00`;
    const endOfDayIso = `${dateStr}T23:59:59`;
    const { data: availabilityBlocksRaw } = await supabaseAdmin
      .from("availability_blocks")
      .select("start_at, end_at, staff_id, location_id")
      .eq("provider_id", providerId)
      .gt("end_at", startOfDayIso)
      .lt("start_at", endOfDayIso);

    const availabilityBlocks = (availabilityBlocksRaw ?? []).filter((ab: { staff_id?: string | null; location_id?: string | null }) => {
      const staffOk = ab.staff_id == null || staffIds.length !== 1 || ab.staff_id === staffIds[0];
      const locOk = ab.location_id == null || !locationId || ab.location_id === locationId;
      return staffOk && locOk;
    });

    // Build blocked intervals from bookings: use per-service start/end when filtering by staff so only that staff's busy period is blocked
    type BlockInterval = { start: Date; end: Date };
    const blockedIntervals: BlockInterval[] = [];
    for (const b of dayBookings || []) {
      const services = b.booking_services || [];
      const totalDuration = services.reduce((s: number, bs: any) => s + (bs.duration_minutes || 30), 0);
      const bookingStart = new Date(b.scheduled_at);
      const bookingEndDefault = addMinutes(bookingStart, totalDuration);

      if (staffIds.length > 0) {
        const bookingStaffIds = services.map((bs: any) => bs.staff_id).filter(Boolean);
        const noStaffAssigned = bookingStaffIds.length === 0;
        const requestedStaffInBooking = staffIds.some((sid: string) => bookingStaffIds.includes(sid));
        if (!noStaffAssigned && !requestedStaffInBooking) continue;

        if (noStaffAssigned) {
          const end = services.every((bs: any) => bs.scheduled_start_at && bs.scheduled_end_at)
            ? new Date(Math.max(...services.map((bs: any) => new Date(bs.scheduled_end_at).getTime())))
            : bookingEndDefault;
          blockedIntervals.push({ start: bookingStart, end });
        } else {
          let cursor = bookingStart.getTime();
          for (const bs of services) {
            const staffMatch = bs.staff_id && staffIds.includes(bs.staff_id);
            if (!staffMatch) {
              if (bs.scheduled_start_at && bs.scheduled_end_at) cursor = new Date(bs.scheduled_end_at).getTime();
              else cursor += (bs.duration_minutes || 30) * 60000;
              continue;
            }
            const dur = bs.duration_minutes ?? 30;
            let start: Date;
            let end: Date;
            if (bs.scheduled_start_at && bs.scheduled_end_at) {
              start = new Date(bs.scheduled_start_at);
              end = new Date(bs.scheduled_end_at);
            } else {
              start = new Date(cursor);
              end = addMinutes(start, dur);
            }
            blockedIntervals.push({ start, end });
            cursor = end.getTime();
          }
        }
      } else {
        const start = bookingStart;
        const end = services.every((bs: any) => bs.scheduled_start_at && bs.scheduled_end_at)
          ? new Date(Math.max(...services.map((bs: any) => new Date(bs.scheduled_end_at).getTime())))
          : bookingEndDefault;
        blockedIntervals.push({ start, end });
      }
    }

    // If all requested staff are on PTO/day off, no slots available
    if (staffIds.length > 0 && staffIds.every((sid) => staffDaysOff.includes(sid))) {
      return successResponse({ slots: [], date: dateStr });
    }

    for (const slot of slotTimes) {
      const startTime = new Date(`${dateStr}T${slot}:00`);
      const endTime = addMinutes(startTime, durationMinutes);
      let blocked = false;

      for (const interval of blockedIntervals) {
        if (startTime < interval.end && endTime > interval.start) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      for (const block of timeBlocks || []) {
        const startPart = typeof block.start_time === "string" ? block.start_time.slice(0, 5) : "00:00";
        const endPart = typeof block.end_time === "string" ? block.end_time.slice(0, 5) : "23:59";
        const blockStart = new Date(`${block.date}T${startPart}:00`);
        const blockEnd = new Date(`${block.date}T${endPart}:00`);
        if (startTime < blockEnd && endTime > blockStart) {
          if (!block.staff_id || staffIds.length === 0 || staffIds.includes(block.staff_id)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      for (const ab of availabilityBlocks) {
        const abStart = new Date(ab.start_at);
        const abEnd = new Date(ab.end_at);
        if (startTime < abEnd && endTime > abStart) {
          blocked = true;
          break;
        }
      }
      if (!blocked) available.push(slot);
    }

    return successResponse({ slots: available, date: dateStr });
  } catch (error) {
    return handleApiError(error, "Failed to get available slots");
  }
}
