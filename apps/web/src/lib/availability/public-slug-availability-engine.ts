/**
 * Shared engine: loadAvailabilityConstraints + calculateAvailableSlots — same as
 * portal (`/api/portal/availability`) and `/api/availability`, extended with
 * public calendar parity (availability_blocks, staff time off / day off).
 *
 * B12: this file is the single contract both the public slug endpoint and the
 * legacy `/api/availability` route go through. {@link computePublicSlugAvailabilitySlots}
 * emits the public `AvailabilitySlot[]` shape (ISO start/end). Legacy callers
 * that still expect `{ time, available }` rows can use
 * {@link availabilitySlotsAsTimeSlots} to convert without duplicating the engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SYNTHETIC_PROVIDER_STAFF_PREFIX } from "@beautonomi/utils";
import { loadAvailabilityConstraints } from "./load-constraints";
import { calculateAvailableSlots } from "./calculate-slots";
import type { TimeSlot } from "./types";
import type { AvailabilitySlot } from "@/types/beautonomi";
import { combineDateAndTime } from "./time-utils";

function mapTimeSlotsToPublicShape(
  slots: TimeSlot[],
  date: string,
  totalBlockedMinutes: number,
  staffId?: string,
  locationId?: string | null
): AvailabilitySlot[] {
  return slots.map((s) => {
    const start = combineDateAndTime(date, s.time);
    const end = new Date(start.getTime() + totalBlockedMinutes * 60 * 1000);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      staff_id: staffId || undefined,
      location_id: locationId || undefined,
      is_available: s.available,
    };
  });
}

/**
 * Union “any staff” slots: first staff who is available wins (same UX as legacy public route).
 */
function mergeAnyStaffSlots(
  perStaff: Array<{ staffId: string; slots: TimeSlot[] }>,
  date: string,
  totalBlockedMinutes: number,
  locationId?: string | null
): AvailabilitySlot[] {
  const allTimes = new Set<string>();
  for (const p of perStaff) {
    for (const s of p.slots) {
      allTimes.add(s.time);
    }
  }

  return [...allTimes]
    .sort((a, b) => a.localeCompare(b))
    .map((timeStr) => {
      let pickedStaff: string | undefined;
      let available = false;
      for (const p of perStaff) {
        const slot = p.slots.find((x) => x.time === timeStr);
        if (slot?.available) {
          available = true;
          pickedStaff = p.staffId;
          break;
        }
      }
      const start = combineDateAndTime(date, timeStr);
      const end = new Date(start.getTime() + totalBlockedMinutes * 60 * 1000);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        staff_id: available ? pickedStaff : undefined,
        location_id: locationId || undefined,
        is_available: available,
      };
    });
}

export async function computePublicSlugAvailabilitySlots(args: {
  supabase: SupabaseClient;
  providerId: string;
  date: string;
  totalBlockedMinutes: number;
  travelBufferMinutes: number;
  locationId?: string | null;
  /** Raw `staff_id` query: "any", "", "provider-{uuid}", or provider_staff id */
  staffIdParam: string | null;
  /** Active provider_staff rows (any-staff mode); empty when solo synthetic */
  activeStaffRows: Array<{ id: string }>;
  excludeHoldId?: string;
  /** Exclude a booking from conflict checks (reschedule flow) */
  excludeBookingId?: string;
}): Promise<AvailabilitySlot[]> {
  const {
    supabase,
    providerId,
    date,
    totalBlockedMinutes,
    travelBufferMinutes,
    locationId,
    staffIdParam,
    activeStaffRows,
    excludeHoldId,
    excludeBookingId,
  } = args;

  const anyoneMode =
    staffIdParam === "any" ||
    staffIdParam === "" ||
    (typeof staffIdParam === "string" && staffIdParam.startsWith("provider-"));

  const effectiveStaffId = anyoneMode || !staffIdParam?.trim() ? null : staffIdParam.trim();

  const parityBase = {
    providerId,
    locationId: locationId ?? null,
    date,
  };

  const runForStaff = async (staffColumnId: string, staffIdsForTimeOff: string[]) => {
    const constraints = await loadAvailabilityConstraints(
      supabase,
      staffColumnId,
      date,
      providerId,
      {
        excludeHoldId,
        excludeBookingId,
        publicCalendarParity: {
          ...parityBase,
          slotStaffId: staffColumnId,
          staffIdsForTimeOff,
        },
      }
    );
    const avoidGaps = constraints.providerSettings?.avoidGaps ?? false;
    return calculateAvailableSlots(constraints, totalBlockedMinutes, date, {
      slotInterval: 15,
      travelBuffer: travelBufferMinutes,
      avoidGaps,
    });
  };

  if (anyoneMode && activeStaffRows.length > 0) {
    const sortedStaff = [...activeStaffRows].sort((a, b) => a.id.localeCompare(b.id));
    const perStaff = await Promise.all(
      sortedStaff.map(async (s) => ({
        staffId: s.id,
        slots: await runForStaff(s.id, [s.id]),
      }))
    );
    return mergeAnyStaffSlots(perStaff, date, totalBlockedMinutes, locationId);
  }

  const soloSyntheticId = `${SYNTHETIC_PROVIDER_STAFF_PREFIX}${providerId}`;
  const staffColumnId = effectiveStaffId || soloSyntheticId;

  const staffIdsForTimeOff =
    effectiveStaffId && !effectiveStaffId.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX)
      ? [effectiveStaffId]
      : [];

  const slots = await runForStaff(staffColumnId, staffIdsForTimeOff);

  const emitStaffId =
    staffColumnId.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX) ? undefined : staffColumnId;

  return mapTimeSlotsToPublicShape(slots, date, totalBlockedMinutes, emitStaffId, locationId);
}

/**
 * B12: convert `AvailabilitySlot[]` (ISO start/end, the public slug contract)
 * back to the legacy `TimeSlot` shape `{ time, available }` used by
 * `/api/availability` consumers (the canonical `/booking` web flow, mobile's
 * `AvailabilitySlotPicker`). The input uses ISO-8601 UTC while `time` is a
 * wall-clock `HH:MM` aligned to the same provider timezone the engine already
 * emitted it in — so we project back via the ISO `start` string.
 */
export function availabilitySlotsAsTimeSlots(
  slots: AvailabilitySlot[],
): TimeSlot[] {
  return slots.map((s) => {
    // `start` was produced by `combineDateAndTime(date, "HH:MM")` above, so the
    // HH:MM component we want back is the one the engine originally emitted.
    // Using `substring` on the ISO keeps the same timezone alignment — parsing
    // via `new Date()` + `toLocaleString` would risk a TZ shift on the server.
    const isoTimePart = s.start.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
    return {
      time: isoTimePart,
      available: s.is_available,
    };
  });
}
