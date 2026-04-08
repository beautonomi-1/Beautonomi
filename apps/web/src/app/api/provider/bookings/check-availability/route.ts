import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";
import { resolveWorkingHoursDayForSingleStaffOrSyntheticSolo } from "@/lib/provider-booking/resolve-working-hours-single-staff-or-synthetic";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";

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

    const scheduledAt = sp.get("scheduled_at");
    const durationMinutes = parseInt(sp.get("duration_minutes") || "60", 10);
    const staffIdsParam = sp.get("staff_ids");
    const locationId = sp.get("location_id");
    /** When rescheduling, ignore the booking being edited so the slot does not conflict with itself. */
    const excludeBookingId = sp.get("exclude_booking_id");

    if (!scheduledAt) {
      return handleApiError(new Error("scheduled_at is required"), "VALIDATION_ERROR", 400);
    }

    const startTime = new Date(scheduledAt);
    const endTime = addMinutes(startTime, durationMinutes);
    const dateStr = scheduledAt.slice(0, 10);

    const conflicts: string[] = [];
    const staffIds = staffIdsParam ? staffIdsParam.split(",").filter(Boolean) : [];

    const holdStaffId = staffIds.length === 1 ? staffIds[0] : null;
    const holdBlocked = await checkActiveHoldOverlap(
      supabaseAdmin,
      providerId,
      startTime,
      endTime,
      { dbStaffId: holdStaffId }
    );
    if (holdBlocked) {
      conflicts.push("Another customer is holding this time slot (checkout in progress)");
    }

    // 1) Existing bookings overlap
    let query = supabaseAdmin
      .from("bookings")
      .select("id, booking_number, scheduled_at, booking_services(duration_minutes, staff_id)")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", new Date(startTime.getTime() - durationMinutes * 60000).toISOString())
      .lte("scheduled_at", endTime.toISOString());

    if (excludeBookingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(excludeBookingId)) {
      query = query.neq("id", excludeBookingId);
    }

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { data: overlapping } = await query;

    (overlapping || []).forEach((b: any) => {
      const bStart = new Date(b.scheduled_at);
      const bDuration = (b.booking_services || []).reduce((s: number, bs: any) => s + (bs.duration_minutes || 30), 0);
      const bEnd = addMinutes(bStart, bDuration);

      if (startTime < bEnd && endTime > bStart) {
        if (staffIds.length > 0) {
          const bookingStaffIds = (b.booking_services || []).map((bs: any) => bs.staff_id).filter(Boolean);
          const hasConflict = bookingStaffIds.length === 0 || staffIds.some((sid) => bookingStaffIds.includes(sid));
          if (hasConflict) conflicts.push(`Conflict with booking #${b.booking_number}`);
        } else {
          conflicts.push(`Conflict with booking #${b.booking_number}`);
        }
      }
    });

    // 2) Time blocks (breaks, time off) – treat as unavailable
    const { data: timeBlocks } = await supabaseAdmin
      .from("time_blocks")
      .select("id, staff_id, name, date, start_time, end_time, is_active")
      .eq("provider_id", providerId)
      .eq("date", dateStr)
      .eq("is_active", true);

    (timeBlocks || []).forEach((block: any) => {
      const startPart = typeof block.start_time === "string" ? block.start_time.slice(0, 5) : "00:00";
      const endPart = typeof block.end_time === "string" ? block.end_time.slice(0, 5) : "23:59";
      const blockStart = new Date(`${block.date}T${startPart}:00`);
      const blockEnd = new Date(`${block.date}T${endPart}:00`);
      if (startTime < blockEnd && endTime > blockStart) {
        const appliesToStaff = !block.staff_id || staffIds.length === 0 || staffIds.includes(block.staff_id);
        if (appliesToStaff) {
          conflicts.push(block.name ? `Time block: ${block.name}` : "Time block conflicts with this slot");
        }
      }
    });

    // Optional: working hours – if we have staff or location hours for this day, check slot is within and not in a break
    const startMin = startTime.getHours() * 60 + startTime.getMinutes();
    const endMin = endTime.getHours() * 60 + endTime.getMinutes();
    if (staffIds.length === 1) {
      const dayKey = dayKeyFromDate(dateStr);
      const wh = await resolveWorkingHoursDayForSingleStaffOrSyntheticSolo(
        supabaseAdmin,
        providerId,
        staffIds[0],
        dayKey
      );

      if (wh && wh.is_open !== false && wh.open_time && wh.close_time) {
        const openMin = parseTimeToMinutes(wh.open_time);
        const closeMin = parseTimeToMinutes(wh.close_time);
        if (openMin !== null && closeMin !== null && closeMin > openMin) {
          if (startMin < openMin || endMin > closeMin) conflicts.push("Outside working hours");
          for (const br of wh.breaks ?? []) {
            const bs = parseTimeToMinutes(br.start);
            const be = parseTimeToMinutes(br.end);
            if (bs !== null && be !== null && be > bs && startMin < be && endMin > bs) {
              conflicts.push("Overlaps break");
              break;
            }
          }
        }
      }
    } else if (locationId) {
      const { data: loc } = await supabaseAdmin
        .from("provider_locations")
        .select("id, working_hours")
        .eq("id", locationId)
        .eq("provider_id", providerId)
        .single();
      const wh = (loc?.working_hours as Record<string, WorkingHoursDay> | null)?.[dayKeyFromDate(dateStr)];
      if (wh && wh.is_open !== false && wh.open_time && wh.close_time) {
        const openMin = parseTimeToMinutes(wh.open_time);
        const closeMin = parseTimeToMinutes(wh.close_time);
        if (openMin !== null && closeMin !== null && closeMin > openMin) {
          if (startMin < openMin || endMin > closeMin) conflicts.push("Outside working hours");
          for (const br of wh.breaks ?? []) {
            const bs = parseTimeToMinutes(br.start);
            const be = parseTimeToMinutes(br.end);
            if (bs !== null && be !== null && be > bs && startMin < be && endMin > bs) {
              conflicts.push("Overlaps break");
              break;
            }
          }
        }
      }
    }

    // Optional: availability_blocks overlapping this slot
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
    for (const ab of availabilityBlocks) {
      const abStart = new Date(ab.start_at);
      const abEnd = new Date(ab.end_at);
      if (startTime < abEnd && endTime > abStart) {
        conflicts.push("Blocked time (unavailable)");
        break;
      }
    }

    return successResponse({
      available: conflicts.length === 0,
      conflicts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check availability");
  }
}
