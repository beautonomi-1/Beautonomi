/**
 * Extra blocked intervals for public booking availability so
 * `loadAvailabilityConstraints` + `calculateAvailableSlots` match
 * GET /api/public/providers/[slug]/availability (availability_blocks, staff time off, day off).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingService } from "./types";
import { combineDateAndTime } from "./time-utils";

const SYNTHETIC_OFFERING = "00000000-0000-0000-0000-000000000000";

function syntheticBooking(args: {
  key: string;
  staffId: string | null;
  start: string;
  end: string;
}): BookingService {
  return {
    id: `parity-${args.key}`,
    booking_id: `parity-${args.key}`,
    offering_id: SYNTHETIC_OFFERING,
    staff_id: args.staffId,
    scheduled_start_at: args.start,
    scheduled_end_at: args.end,
    duration_minutes: 0,
    buffer_minutes: 0,
    processing_minutes: 0,
    finishing_minutes: 0,
  };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoAtLocalDateMinutes(dateStr: string, minutes: number, timezone?: string | null): string {
  const hh = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mm = (minutes % 60).toString().padStart(2, "0");
  return combineDateAndTime(dateStr, `${hh}:${mm}:00`, timezone ?? undefined).toISOString();
}

/** Same filter as legacy public availability for calendar blocks. */
function blockAppliesToStaffSlot(
  blockStaffId: string | null | undefined,
  slotStaffId: string | null
): boolean {
  if (!slotStaffId) return true;
  if (!blockStaffId) return true;
  return blockStaffId === slotStaffId;
}

function blockAppliesToLocation(
  blockLocationId: string | null | undefined,
  locationId: string | null | undefined
): boolean {
  if (!locationId) return true;
  if (!blockLocationId) return true;
  return blockLocationId === locationId;
}

/**
 * Synthetic booking rows merged into `existingBookings` so `calculateBookingSegments`
 * blocks the same windows as the legacy public slug loop.
 */
export async function loadPublicCalendarParityBookings(
  db: SupabaseClient,
  admin: SupabaseClient,
  args: {
    providerId: string;
    date: string;
    locationId?: string | null;
    /** Resolved staff column (may be synthetic `provider-{uuid}`). */
    slotStaffId: string | null;
    staffIdsForTimeOff: string[];
    providerTimeZone?: string | null;
  }
): Promise<BookingService[]> {
  const { providerId, date, locationId, slotStaffId, staffIdsForTimeOff, providerTimeZone } = args;
  const out: BookingService[] = [];

  const startOfDayIso = isoAtLocalDateMinutes(date, 0, providerTimeZone);
  const endOfDayIso = isoAtLocalDateMinutes(addDays(date, 1), 0, providerTimeZone);

  const { data: blocks, error: blocksError } = await db
    .from("availability_blocks")
    .select("id, start_at, end_at, staff_id, location_id")
    .eq("provider_id", providerId)
    .gt("end_at", startOfDayIso)
    .lt("start_at", endOfDayIso);

  if (blocksError) {
    console.error("publicCalendarParity: availability_blocks", blocksError);
  } else {
    for (const blk of blocks || []) {
      if (!blockAppliesToStaffSlot(blk.staff_id as string | null, slotStaffId)) continue;
      if (!blockAppliesToLocation(blk.location_id as string | null, locationId ?? null)) continue;
      out.push(
        syntheticBooking({
          key: `ab-${blk.id}`,
          staffId: slotStaffId,
          start: blk.start_at as string,
          end: blk.end_at as string,
        })
      );
    }
  }

  if (staffIdsForTimeOff.length === 0) {
    return out;
  }

  const { data: timeOffRows, error: timeOffError } = await admin
    .from("staff_time_off")
    .select("staff_id, status")
    .eq("provider_id", providerId)
    .lte("start_date", date)
    .gte("end_date", date)
    .in("staff_id", staffIdsForTimeOff);

  if (!timeOffError && timeOffRows?.length) {
    for (const row of timeOffRows) {
      // Only approved time off blocks availability (pending/denied requests do
      // not). Legacy rows without a status are treated as approved.
      const status = (row as { status?: string | null }).status;
      if (status != null && status !== "approved") continue;
      if (row.staff_id) {
        out.push(
          syntheticBooking({
            key: `sto-${row.staff_id}`,
            staffId: row.staff_id as string,
            start: startOfDayIso,
            end: endOfDayIso,
          })
        );
      }
    }
  }

  const { data: daysOffRows, error: daysOffError } = await admin
    .from("staff_days_off")
    .select("staff_id, is_approved")
    .eq("provider_id", providerId)
    .eq("date", date)
    .in("staff_id", staffIdsForTimeOff);

  if (!daysOffError && daysOffRows?.length) {
    for (const row of daysOffRows) {
      if (row.staff_id && row.is_approved !== false) {
        out.push(
          syntheticBooking({
            key: `sdo-${row.staff_id}`,
            staffId: row.staff_id as string,
            start: startOfDayIso,
            end: endOfDayIso,
          })
        );
      }
    }
  }

  return out;
}
