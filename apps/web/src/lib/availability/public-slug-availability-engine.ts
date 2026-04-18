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
import { formatInTimeZone } from "date-fns-tz";
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
  locationId?: string | null,
  providerTimeZone?: string
): AvailabilitySlot[] {
  return slots.map((s) => {
    const start = combineDateAndTime(date, s.time, providerTimeZone);
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
 *
 * §Release-audit 2026-04: per-time payload now also carries every staff member
 * who is free at that slot (`availableStaffIds`). The web booking hold route
 * prefers the same staff the union actually surfaced, so a client's picked slot
 * survives even when an earlier-id staffer fetches a hold first.
 */
function mergeAnyStaffSlots(
  perStaff: Array<{ staffId: string; slots: TimeSlot[] }>,
  date: string,
  totalBlockedMinutes: number,
  locationId?: string | null,
  providerTimeZone?: string
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
      const availableStaffIds: string[] = [];
      for (const p of perStaff) {
        const slot = p.slots.find((x) => x.time === timeStr);
        if (slot?.available) {
          availableStaffIds.push(p.staffId);
          if (!available) {
            available = true;
            pickedStaff = p.staffId;
          }
        }
      }
      const start = combineDateAndTime(date, timeStr, providerTimeZone);
      const end = new Date(start.getTime() + totalBlockedMinutes * 60 * 1000);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        staff_id: available ? pickedStaff : undefined,
        location_id: locationId || undefined,
        is_available: available,
        available_staff_ids: availableStaffIds.length > 0 ? availableStaffIds : undefined,
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
  /**
   * §Release-audit 2026-04: provider's IANA timezone (e.g. `Africa/Johannesburg`).
   * When set, slot HH:MM times are interpreted as provider-local wall-clock times
   * and emitted as correct UTC instants in `start`/`end`. When omitted we fall
   * back to the legacy behaviour where HH:MM is treated as UTC — only correct
   * when the server is running in UTC. Prefer passing the value.
   */
  providerTimeZone?: string | null;
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
    providerTimeZone,
  } = args;

  const providerTz = providerTimeZone?.trim() || undefined;

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
      timezone: providerTz,
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
    return mergeAnyStaffSlots(perStaff, date, totalBlockedMinutes, locationId, providerTz);
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

  return mapTimeSlotsToPublicShape(
    slots,
    date,
    totalBlockedMinutes,
    emitStaffId,
    locationId,
    providerTz
  );
}

/**
 * B12: convert `AvailabilitySlot[]` (ISO start/end, the public slug contract)
 * back to the legacy `TimeSlot` shape `{ time, available }` used by
 * `/api/availability` consumers (the canonical `/booking` web flow, mobile's
 * `AvailabilitySlotPicker`).
 *
 * §Release-audit 2026-04: when the engine emitted UTC-matching-wall-clock
 * behaviour (no provider TZ), the old substring-on-ISO trick produced the
 * right label only when the server ran in UTC. Now that the engine can emit
 * true UTC instants for a provider's zone, pass that zone here so the label
 * is always the provider's wall clock (e.g. `start = 2026-06-10T13:00Z` for
 * Africa/Johannesburg → label `15:00`). Without a zone we preserve the old
 * behaviour for backwards compatibility.
 */
export function availabilitySlotsAsTimeSlots(
  slots: AvailabilitySlot[],
  providerTimeZone?: string | null,
): TimeSlot[] {
  const tz = providerTimeZone?.trim();
  return slots.map((s) => {
    if (tz) {
      try {
        return {
          time: formatInTimeZone(s.start, tz, "HH:mm"),
          available: s.is_available,
        };
      } catch {
        // Fall through to substring fallback if zone is invalid at runtime.
      }
    }
    const isoTimePart = s.start.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
    return {
      time: isoTimePart,
      available: s.is_available,
    };
  });
}
