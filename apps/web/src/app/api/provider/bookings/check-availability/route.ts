import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";
import { resolveWorkingHoursDayForSingleStaffOrSyntheticSolo } from "@/lib/provider-booking/resolve-working-hours-single-staff-or-synthetic";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";
import { expandRecurringPattern } from "@/lib/availability/time-utils";

/**
 * GET /api/provider/bookings/check-availability
 *
 * Clients must send `duration_minutes` equal to the total wall-clock span of all
 * `booking_services` segments (sum of durations — aligned with
 * `computeSequentialServiceWindow` in `reschedule-booking-services.ts` and PATCH
 * `/api/provider/bookings/[id]` reschedule, which chains rows via
 * `rescheduleBookingServicesSequential`).
 *
 * This route performs more pre-flight checks than PATCH `checkBookingConflict`
 * (active holds, recurring time_blocks, availability_blocks, staff days off, optional
 * working hours, etc.). PATCH still enforces staff overlap via `checkBookingConflict`
 * plus `isProviderCalendarWindowBlocked` — that narrower vs broader split is intentional.
 */

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
    /**
     * §Provider-audit 2026-04: pre-flight the resources (rooms / chairs /
     * equipment) that the chosen offerings require, matching the logic the
     * final `POST /api/provider/bookings` runs at commit time. Before this
     * change the provider only discovered resource conflicts at the end of
     * the confirmation flow (409 `RESOURCE_CONFLICT`), which felt like a
     * flaky back-end from the UI. Consumers pass `offering_ids` (comma-
     * separated) for the offering catalogue and (optionally) the
     * `exclude_booking_id` already in use above.
     */
    const offeringIdsParam = sp.get("offering_ids");
    const offeringIds = offeringIdsParam
      ? offeringIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    if (!scheduledAt) {
      return handleApiError(new Error("scheduled_at is required"), "scheduled_at is required", "VALIDATION_ERROR", 400);
    }

    const startTime = new Date(scheduledAt);
    // Total span must match multi-service bookings: sum of `booking_services.duration_minutes`,
    // same window as `computeSequentialServiceWindow` + PATCH /api/provider/bookings/[id].
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
      .select("id, booking_number, scheduled_at, booking_services(duration_minutes, staff_id, scheduled_start_at, scheduled_end_at)")
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
      const services = b.booking_services || [];
      const bStart = new Date(b.scheduled_at);
      const hasScheduledTimes = services.length > 0 && services.every((bs: any) => bs.scheduled_start_at && bs.scheduled_end_at);
      const bEnd = hasScheduledTimes
        ? new Date(Math.max(...services.map((bs: any) => new Date(bs.scheduled_end_at).getTime())))
        : addMinutes(bStart, services.reduce((s: number, bs: any) => s + (bs.duration_minutes || 30), 0));

      if (startTime < bEnd && endTime > bStart) {
        if (staffIds.length > 0) {
          const bookingStaffIds = services.map((bs: any) => bs.staff_id).filter(Boolean);
          const hasConflict = bookingStaffIds.length === 0 || staffIds.some((sid: string) => bookingStaffIds.includes(sid));
          if (hasConflict) conflicts.push(`Conflict with booking #${b.booking_number}`);
        } else {
          conflicts.push(`Conflict with booking #${b.booking_number}`);
        }
      }
    });

    // 2) Time blocks (breaks, time off) – treat as unavailable; includes recurring expansion
    const { data: dateTimeBlocks } = await supabaseAdmin
      .from("time_blocks")
      .select("id, staff_id, name, date, start_time, end_time, is_active")
      .eq("provider_id", providerId)
      .eq("date", dateStr)
      .eq("is_active", true);

    const { data: recurringTimeBlocks } = await supabaseAdmin
      .from("time_blocks")
      .select("id, staff_id, name, date, start_time, end_time, is_active, is_recurring, recurring_pattern")
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

    (timeBlocks).forEach((block: any) => {
      const startPart = typeof block.start_time === "string" ? block.start_time.slice(0, 5) : "00:00";
      const endPart = typeof block.end_time === "string" ? block.end_time.slice(0, 5) : "23:59";
      const blockStart = new Date(`${dateStr}T${startPart}:00`);
      const blockEnd = new Date(`${dateStr}T${endPart}:00`);
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
    const dayKey = dayKeyFromDate(dateStr);
    if (staffIds.length === 1) {
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
    } else if (staffIds.length > 1) {
      // §Provider-audit 2026-04: multi-staff bookings previously fell through
      // to the location-hours branch, which meant a tight schedule (one staff
      // ends at 14:00 on that weekday) could be silently booked over. Check
      // each assigned staff member's own working hours; any one of them being
      // outside hours or in a break fails the slot.
      const checkedStaff = new Set<string>();
      for (const sid of staffIds) {
        if (!sid || checkedStaff.has(sid)) continue;
        checkedStaff.add(sid);
        const wh = await resolveWorkingHoursDayForSingleStaffOrSyntheticSolo(
          supabaseAdmin,
          providerId,
          sid,
          dayKey,
        );
        if (!wh) continue;
        if (wh.is_open === false) {
          conflicts.push("Staff is not scheduled to work on this day");
          continue;
        }
        if (!wh.open_time || !wh.close_time) continue;
        const openMin = parseTimeToMinutes(wh.open_time);
        const closeMin = parseTimeToMinutes(wh.close_time);
        if (openMin === null || closeMin === null || closeMin <= openMin) continue;
        if (startMin < openMin || endMin > closeMin) {
          conflicts.push("Outside staff working hours");
          continue;
        }
        for (const br of wh.breaks ?? []) {
          const bs = parseTimeToMinutes(br.start);
          const be = parseTimeToMinutes(br.end);
          if (bs !== null && be !== null && be > bs && startMin < be && endMin > bs) {
            conflicts.push("Overlaps staff break");
            break;
          }
        }
      }
    } else {
      // Fallback: check primary location hours when no specific staff/location given
      const locIdToCheck = locationId;
      let locQuery = supabaseAdmin
        .from("provider_locations")
        .select("id, working_hours")
        .eq("provider_id", providerId)
        .eq("is_active", true);
      if (locIdToCheck) {
        locQuery = locQuery.eq("id", locIdToCheck);
      } else {
        locQuery = locQuery.order("is_primary", { ascending: false }).limit(1);
      }
      const { data: locs } = await locQuery;
      const loc = locs?.[0];
      const wh = (loc?.working_hours as Record<string, WorkingHoursDay> | null)?.[dayKey];
      if (wh) {
        const isClosed = wh.is_open === false || (wh as Record<string, unknown>).closed === true;
        if (isClosed) {
          conflicts.push("Business is closed on this day");
        } else if (wh.open_time && wh.close_time) {
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

    // 5) Staff days off and time off
    if (staffIds.length > 0) {
      const { data: daysOffRows } = await supabaseAdmin
        .from("staff_days_off")
        .select("staff_id")
        .eq("provider_id", providerId)
        .eq("date", dateStr)
        .in("staff_id", staffIds)
        .or("is_approved.is.null,is_approved.eq.true");
      const staffOnDayOff = new Set((daysOffRows || []).map((r: any) => r.staff_id as string));

      const { data: timeOffRows } = await supabaseAdmin
        .from("staff_time_off")
        .select("staff_id")
        .eq("provider_id", providerId)
        .lte("start_date", dateStr)
        .gte("end_date", dateStr)
        .in("staff_id", staffIds)
        .not("status", "eq", "denied");
      for (const row of timeOffRows || []) {
        if (row.staff_id) staffOnDayOff.add(row.staff_id as string);
      }

      const affectedStaff = staffIds.filter((sid) => staffOnDayOff.has(sid));
      if (affectedStaff.length > 0) {
        conflicts.push("Staff is on a day off or time off");
      }
    }

    // §Provider-audit 2026-04: resource pre-flight — mirror the commit-
    // time guard in POST /api/provider/bookings so providers see
    // "Room A at capacity" BEFORE pressing Confirm, not after.
    if (offeringIds.length > 0) {
      try {
        const [{ getRequiredResourcesForOffering, checkResourceAvailability }] =
          await Promise.all([import("@/lib/resources/assignment")]);
        const resourceIdSet = new Set<string>();
        for (const offId of offeringIds) {
          const rids = await getRequiredResourcesForOffering(supabaseAdmin as any, offId);
          for (const rid of rids) resourceIdSet.add(rid);
        }
        const resourceIds = Array.from(resourceIdSet);
        if (resourceIds.length > 0) {
          const resourceCheck = await checkResourceAvailability(
            supabaseAdmin as any,
            resourceIds,
            startTime,
            endTime,
            excludeBookingId || undefined,
          );
          if (!resourceCheck.available) {
            // Fetch display names so the provider sees which resource clashed.
            const { data: resourceRows } = await supabaseAdmin
              .from("resources")
              .select("id, name")
              .in("id", resourceCheck.conflicts.map((c) => c.resource_id));
            const nameById = new Map<string, string>();
            for (const row of resourceRows || []) {
              if (row?.id) nameById.set(row.id, row.name || "Resource");
            }
            for (const c of resourceCheck.conflicts) {
              const nm = nameById.get(c.resource_id) || "Resource";
              conflicts.push(`${nm}: ${c.reason}`);
            }
          }
        }
      } catch (resErr) {
        // Non-fatal: if the lookup fails, fall through to commit-time guard.
        console.warn("[check-availability] resource pre-flight failed:", resErr);
      }
    }

    // §Provider-audit 2026-04: dedupe — multi-staff checks may append the
    // same reason multiple times; the client only shows the first one.
    const dedupedConflicts = Array.from(new Set(conflicts));
    return successResponse({
      available: dedupedConflicts.length === 0,
      conflicts: dedupedConflicts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check availability");
  }
}
