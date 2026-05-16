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
    preferredStaffIds,
  } = args;

  const { data: staffRows } = await supabaseAdmin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("id", { ascending: true });

  const activeIds = (staffRows ?? []).map((r: { id: string }) => r.id);
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
