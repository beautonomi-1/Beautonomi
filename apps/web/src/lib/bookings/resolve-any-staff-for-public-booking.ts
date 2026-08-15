/**
 * When the guest chose "any staff" / no preference, every service line may have
 * `staff_id: null`. We must not assign a random team member — that can violate
 * availability_blocks / time_blocks that the slot list already filtered per staff.
 *
 * Picks the first active `provider_staff.id` (sorted) who passes the same calendar
 * block check as payment validation and has no segment conflicts with existing bookings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBookingSnapshotSegmentConflicts } from "./conflict-check";
import { isProviderCalendarWindowBlocked } from "@/lib/public-booking/provider-calendar-block-overlap";
import { loadEffectiveStaffShifts } from "@/lib/availability/load-constraints";
import { segmentFitsAnyShift } from "@/lib/availability/shift-fit";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { formatInTimeZone } from "date-fns-tz";
import {
  applyLocationScopeToStaffIds,
  resolveStaffLocationScope,
} from "@/lib/provider/staff-location-scope";

type BookingServiceLine = {
  offering_id: string;
  staff_id: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes?: number;
  price?: number;
  currency?: string;
};

export type PickAnyStaffResult =
  | { ok: true; staffId: string }
  | { ok: false; reason: "no_team_members" | "no_one_available_for_window" };

export async function pickFirstStaffForNullStaffLines(args: {
  supabaseAdmin: SupabaseClient;
  providerId: string;
  /** at_salon location id; null for at_home */
  locationId: string | null;
  bookingServicesData: BookingServiceLine[];
  offeringBufferMinutesById: Map<string, number>;
  providerTimeZone?: string | null;
  travelBufferMinutes?: number;
  /**
   * §Release-audit 2026-04: the any-staff union in the public slug engine
   * returns every staff who was free at the surfaced wall-clock time in
   * `available_staff_ids`. When the client passes those through, we iterate
   * them FIRST (in the same order the engine sorted them) so the hold's
   * resolved staff matches the one the calendar presented. Without this,
   * two concurrent holds at the same time could race on the earliest-id
   * staffer and one would be incorrectly rejected even though another
   * team member was free.
   */
  preferredStaffIds?: string[] | null;
}): Promise<PickAnyStaffResult> {
  const {
    supabaseAdmin,
    providerId,
    locationId,
    bookingServicesData,
    offeringBufferMinutesById,
    providerTimeZone,
    travelBufferMinutes = 0,
    preferredStaffIds,
  } = args;
  const providerTz = providerTimeZone || DEFAULT_BOOKING_DISPLAY_TIMEZONE;
  const minutesFromInstantInZone = (instant: Date): number => {
    const hm = formatInTimeZone(instant, providerTz, "HH:mm");
    const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const shiftCache = new Map<string, Awaited<ReturnType<typeof loadEffectiveStaffShifts>>>();
  const getShiftsForDate = async (staffId: string, date: string) => {
    const key = `${staffId}|${date}`;
    let resolved = shiftCache.get(key);
    if (!resolved) {
      resolved = await loadEffectiveStaffShifts(
        supabaseAdmin,
        staffId,
        date,
        providerId,
        locationId,
      );
      shiftCache.set(key, resolved);
    }
    return resolved;
  };
  const OVERNIGHT_CUTOFF_MIN = 8 * 60;

  const { data: staffRows } = await supabaseAdmin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("id", { ascending: true });

  let activeIds = (staffRows ?? []).map((r: { id: string }) => r.id);
  if (locationId) {
    const scope = await resolveStaffLocationScope(supabaseAdmin, providerId, locationId);
    activeIds = applyLocationScopeToStaffIds(activeIds, scope);
  }
  if (activeIds.length === 0) {
    return { ok: false, reason: "no_team_members" };
  }
  const activeIdSet = new Set(activeIds);
  const preferred = (preferredStaffIds ?? []).filter((id) => activeIdSet.has(id));
  const remaining = activeIds.filter((id) => !preferred.includes(id));
  const candidateIds = [...preferred, ...remaining];

  for (const cid of candidateIds) {
    const withStaff = bookingServicesData.map((s) => ({ ...s, staff_id: cid }));
    const snapshotLines = withStaff.map((line) => ({
      offering_id: line.offering_id,
      staff_id: line.staff_id ?? null,
      scheduled_start_at: line.scheduled_start_at,
      scheduled_end_at: line.scheduled_end_at,
    }));

    let calendarOk = true;
    for (const line of withStaff) {
      const segStart = new Date(line.scheduled_start_at);
      const segEnd = new Date(line.scheduled_end_at);
      // Keep parity with public availability: missing/invalid buffer = 0, not 15.
      const buf = offeringBufferMinutesById.get(line.offering_id) ?? 0;
      const effectiveEnd = new Date(segEnd.getTime() + buf * 60000);
      const cal = await isProviderCalendarWindowBlocked(supabaseAdmin, {
        providerId,
        locationId,
        staffId: cid,
        startAt: segStart,
        endAt: effectiveEnd,
      });
      if (cal.blocked) {
        calendarOk = false;
        break;
      }
    }
    if (!calendarOk) continue;

    let shiftOk = true;
    for (let idx = 0; idx < withStaff.length; idx++) {
      const line = withStaff[idx];
      const segStart = new Date(line.scheduled_start_at);
      const segEnd = new Date(line.scheduled_end_at);
      const buf = offeringBufferMinutesById.get(line.offering_id) ?? 0;
      const isLast = idx === withStaff.length - 1;
      const travelTail = isLast ? travelBufferMinutes : 0;
      const effectiveEnd = new Date(segEnd.getTime() + (buf + travelTail) * 60000);
      const localDate = formatInTimeZone(segStart, providerTz, "yyyy-MM-dd");
      const segStartMin = minutesFromInstantInZone(segStart);
      const segEndMin = minutesFromInstantInZone(effectiveEnd);
      const resolved = await getShiftsForDate(cid, localDate);
      let fits =
        resolved.workHoursEnabledEffective &&
        resolved.staffShifts.length > 0 &&
        segmentFitsAnyShift(segStartMin, segEndMin, resolved.staffShifts);

      if (!fits && segStartMin < OVERNIGHT_CUTOFF_MIN) {
        const prevDateMs = new Date(`${localDate}T12:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000;
        const prevDate = new Date(prevDateMs).toISOString().slice(0, 10);
        const prevResolved = await getShiftsForDate(cid, prevDate);
        const overnightShifts = prevResolved.staffShifts.filter((s) => {
          const [sh, sm] = s.start_time.split(":").map(Number);
          const [eh, em] = s.end_time.split(":").map(Number);
          const sMin = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
          const eMin = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
          return eMin < sMin || s.end_time === "00:00" || s.end_time === "00:00:00";
        });
        fits =
          prevResolved.workHoursEnabledEffective &&
          overnightShifts.length > 0 &&
          segmentFitsAnyShift(segStartMin, segEndMin, overnightShifts);
      }

      if (!fits) {
        shiftOk = false;
        break;
      }
    }
    if (!shiftOk) continue;

    const segConflict = await checkBookingSnapshotSegmentConflicts(
      supabaseAdmin,
      providerId,
      snapshotLines,
      offeringBufferMinutesById
    );
    if (!segConflict.hasConflict) {
      return { ok: true, staffId: cid };
    }
  }

  return { ok: false, reason: "no_one_available_for_window" };
}
