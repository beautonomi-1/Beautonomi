/**
 * Shared provider booking slot grid: same pipeline as GET /api/provider/bookings/available-slots
 * and computePublicSlugAvailabilitySlots (customer web parity).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { isUuidString } from "@beautonomi/utils";
import {
  availabilitySlotsAsTimeSlots,
  computePublicSlugAvailabilitySlots,
} from "@/lib/availability/public-slug-availability-engine";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";
import type { TimeSlot } from "@/lib/availability/types";
import { HOUSE_CALL_CONFIG } from "@/lib/config/house-call-config";
import type { AvailabilitySlot } from "@/types/beautonomi";

export type ProviderBookingSlotGridArgs = {
  supabase: SupabaseClient;
  providerId: string;
  /** Calendar date YYYY-MM-DD for the provider business day being queried */
  dateStr: string;
  durationMinutes: number;
  staffIdsParam: string | null;
  locationId: string | null;
  excludeBookingId?: string;
  excludeHoldId?: string;
  excludeGroupBookingId?: string;
  mode: "salon" | "mobile";
  /** Raw query param; when `mode=mobile` and absent, default buffer applies */
  travelBufferRaw: string | null;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  /** Offering UUIDs for required-resource marking (same as available-slots) */
  resourceOfferingIds: string[];
};

export type ProviderBookingSlotGridResult = {
  providerTimeZone: string | null;
  slotGrid: TimeSlot[];
  publicSlots: AvailabilitySlot[];
  /** True when the requested calendar day is beyond max_advance_days */
  maxAdvanceExceeded: boolean;
};

function labelFromPublicSlot(slot: AvailabilitySlot, tz: string | null): string {
  if (tz) {
    try {
      return formatInTimeZone(new Date(slot.start), tz, "HH:mm");
    } catch {
      /* fall through */
    }
  }
  return slot.start.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

function intersectStaffTimeSlots(perStaffGrids: TimeSlot[][]): TimeSlot[] {
  const base = perStaffGrids[0] ?? [];
  const maps = perStaffGrids.map((grid) => {
    const m = new Map<string, boolean>();
    for (const s of grid) m.set(s.time, s.available);
    return m;
  });
  return base.map((slot) => {
    const allAvail = maps.every((m) => m.get(slot.time) === true);
    return {
      time: slot.time,
      available: allAvail,
      ...(!allAvail && slot.available ? { reason: "Not all staff are available at this time" as const } : {}),
    };
  });
}

function mergeIntersectedIntoFirstPublic(
  firstPublic: AvailabilitySlot[],
  intersected: TimeSlot[],
  tz: string | null,
): AvailabilitySlot[] {
  const availByTime = new Map(intersected.map((s) => [s.time, s.available]));
  return firstPublic.map((p) => ({
    ...p,
    is_available: availByTime.get(labelFromPublicSlot(p, tz)) ?? false,
  }));
}

function resolveTravelBufferMinutes(mode: "salon" | "mobile", travelBufferRaw: string | null): number {
  if (mode !== "mobile") return 0;
  if (travelBufferRaw != null && travelBufferRaw !== "") {
    const parsed = parseInt(travelBufferRaw, 10);
    return Number.isFinite(parsed) ? Math.min(360, Math.max(0, parsed)) : HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES;
  }
  return HOUSE_CALL_CONFIG.DEFAULT_TRAVEL_BUFFER_MINUTES;
}

/**
 * Computes the same slot grid as GET /api/provider/bookings/available-slots.
 */
export async function computeProviderBookingSlotGrid(
  args: ProviderBookingSlotGridArgs,
): Promise<ProviderBookingSlotGridResult> {
  const {
    supabase,
    providerId,
    dateStr,
    durationMinutes,
    staffIdsParam,
    locationId,
    excludeBookingId,
    excludeHoldId,
    excludeGroupBookingId,
    mode,
    travelBufferRaw,
    minNoticeMinutes,
    maxAdvanceDays,
    resourceOfferingIds,
  } = args;

  const effectiveMinNotice =
    Number.isFinite(minNoticeMinutes) && minNoticeMinutes > 0 ? minNoticeMinutes : 0;
  const effectiveMaxAdvance =
    Number.isFinite(maxAdvanceDays) && maxAdvanceDays >= 1 ? maxAdvanceDays : 365;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateObj = new Date(`${dateStr}T00:00:00`);
  dateObj.setHours(0, 0, 0, 0);
  const daysFromToday = Math.floor((dateObj.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (daysFromToday > effectiveMaxAdvance) {
    return {
      providerTimeZone: null,
      slotGrid: [],
      publicSlots: [],
      maxAdvanceExceeded: true,
    };
  }

  let providerTimeZone: string | null = null;
  try {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("timezone")
      .eq("id", providerId)
      .maybeSingle();
    const raw = (providerRow as { timezone?: string | null } | null)?.timezone ?? null;
    providerTimeZone = normalizeProviderTimezone(raw);
    if (raw && !providerTimeZone) {
      console.warn(`[computeProviderBookingSlotGrid] provider ${providerId} has invalid timezone "${raw}".`);
    }
  } catch {
    // best-effort
  }

  const travelBufferMinutes = resolveTravelBufferMinutes(mode, travelBufferRaw);

  const rawStaff = staffIdsParam ? staffIdsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const uniqueStaffIds = [...new Set(rawStaff)].filter((id) => isUuidString(id));

  let activeStaffRows: Array<{ id: string }> = [];
  if (uniqueStaffIds.length === 0) {
    const { data: staffRows } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId)
      .eq("is_active", true);
    activeStaffRows = (staffRows || []).map((r: { id: string }) => ({ id: r.id }));
  }

  const totalBlockedMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;

  let publicSlots: AvailabilitySlot[];

  if (uniqueStaffIds.length > 1) {
    const sortedIds = [...uniqueStaffIds].sort((a, b) => a.localeCompare(b));
    const perStaffPublic = await Promise.all(
      sortedIds.map((staffId) =>
        computePublicSlugAvailabilitySlots({
          supabase,
          providerId,
          date: dateStr,
          totalBlockedMinutes,
          travelBufferMinutes,
          locationId,
          staffIdParam: staffId,
          activeStaffRows: [],
          excludeHoldId,
          excludeBookingId,
          excludeGroupBookingId,
          providerTimeZone,
        }),
      ),
    );
    const perStaffTs = perStaffPublic.map((g) => availabilitySlotsAsTimeSlots(g, providerTimeZone));
    const intersectedTs = intersectStaffTimeSlots(perStaffTs);
    publicSlots = mergeIntersectedIntoFirstPublic(perStaffPublic[0] ?? [], intersectedTs, providerTimeZone);
  } else if (uniqueStaffIds.length === 1) {
    publicSlots = await computePublicSlugAvailabilitySlots({
      supabase,
      providerId,
      date: dateStr,
      totalBlockedMinutes,
      travelBufferMinutes,
      locationId,
      staffIdParam: uniqueStaffIds[0],
      activeStaffRows: [],
      excludeHoldId,
      excludeBookingId,
      excludeGroupBookingId,
      providerTimeZone,
    });
  } else {
    publicSlots = await computePublicSlugAvailabilitySlots({
      supabase,
      providerId,
      date: dateStr,
      totalBlockedMinutes,
      travelBufferMinutes,
      locationId,
      staffIdParam: "any",
      activeStaffRows,
      excludeHoldId,
      excludeBookingId,
      excludeGroupBookingId,
      providerTimeZone,
    });
  }

  if (effectiveMinNotice > 0) {
    const cutoff = new Date(Date.now() + effectiveMinNotice * 60 * 1000);
    publicSlots = publicSlots.filter((s) => new Date(s.start) >= cutoff);
  }

  const resourceCheckOfferingIds = resourceOfferingIds;

  if (resourceCheckOfferingIds.length > 0 && publicSlots.length > 0) {
    const { data: ownedOfferings } = await supabase
      .from("offerings")
      .select("id")
      .eq("provider_id", providerId)
      .in("id", resourceCheckOfferingIds);
    const validOfferingIds = (ownedOfferings || []).map((o: { id: string }) => o.id);
    if (validOfferingIds.length > 0) {
      const { data: offeringRes } = await supabase
        .from("offering_resources")
        .select("resource_id")
        .in("offering_id", validOfferingIds)
        .eq("required", true);
      const resourceIds = [...new Set((offeringRes || []).map((r: { resource_id: string }) => r.resource_id))];
      if (resourceIds.length > 0) {
        const { checkResourceAvailability } = await import("@/lib/resources/assignment");
        const resourceReasonByTime = new Map<string, string>();
        const filtered: AvailabilitySlot[] = [];
        for (const slot of publicSlots) {
          const startAt = new Date(slot.start);
          const endAt = new Date(slot.end);
          const check = await checkResourceAvailability(
            supabase,
            resourceIds,
            startAt,
            endAt,
            excludeBookingId,
          );
          if (check.available) {
            filtered.push(slot);
          } else {
            const timeKey = labelFromPublicSlot(slot, providerTimeZone);
            let detail = check.conflicts.map((c) => `${c.resource_id}: ${c.reason}`).join("; ");
            try {
              const { data: resourceRows } = await supabase
                .from("resources")
                .select("id, name")
                .in(
                  "id",
                  check.conflicts.map((c) => c.resource_id),
                );
              const nameById = new Map<string, string>();
              for (const row of resourceRows || []) {
                if (row?.id) nameById.set(row.id, row.name || "Resource");
              }
              detail = check.conflicts
                .map((c) => `${nameById.get(c.resource_id) || "Resource"}: ${c.reason}`)
                .join("; ");
            } catch {
              /* keep id-based detail from check.conflicts */
            }
            resourceReasonByTime.set(timeKey, detail);
            filtered.push({ ...slot, is_available: false });
          }
        }
        publicSlots = filtered;

        let slotGrid = availabilitySlotsAsTimeSlots(publicSlots, providerTimeZone);
        slotGrid = slotGrid.map((s) => {
          const extra = resourceReasonByTime.get(s.time);
          if (extra && !s.available) {
            return { ...s, reason: extra };
          }
          return s;
        });
        return {
          providerTimeZone,
          slotGrid,
          publicSlots,
          maxAdvanceExceeded: false,
        };
      }
    }
  }

  const slotGrid = availabilitySlotsAsTimeSlots(publicSlots, providerTimeZone);

  return {
    providerTimeZone,
    slotGrid,
    publicSlots,
    maxAdvanceExceeded: false,
  };
}

function wallClockTimeLabelForEval(scheduledAt: Date, providerTimeZone: string | null): string {
  if (providerTimeZone) {
    try {
      return formatInTimeZone(scheduledAt, providerTimeZone, "HH:mm");
    } catch {
      /* fall through */
    }
  }
  return scheduledAt.toISOString().match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

function calendarDateInProviderZoneForEval(scheduledAt: Date, providerTimeZone: string | null): string {
  if (providerTimeZone) {
    try {
      return formatInTimeZone(scheduledAt, providerTimeZone, "yyyy-MM-dd");
    } catch {
      /* fall through */
    }
  }
  return scheduledAt.toISOString().slice(0, 10);
}

export type EvaluateProviderSlotAgainstGridInput = {
  providerId: string;
  scheduledAt: Date;
  durationMinutes: number;
  staffIdsCsv: string | null;
  locationId: string | null;
  excludeBookingId?: string;
  excludeGroupBookingId?: string;
  mode: "salon" | "mobile";
  travelBufferRaw: string | null;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  resourceOfferingIds: string[];
};

/**
 * Verifies `scheduledAt` + duration matches an **available** row in the shared engine grid
 * (same as GET `/api/provider/bookings/check-availability` core check). Used at commit time
 * on POST/PATCH so server validation cannot diverge from the slot picker.
 */
export async function evaluateProviderSlotAgainstGrid(
  supabase: SupabaseClient,
  input: EvaluateProviderSlotAgainstGridInput,
): Promise<{ ok: boolean; conflicts: string[]; providerTimeZone: string | null }> {
  let providerTimeZone: string | null = null;
  try {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("timezone")
      .eq("id", input.providerId)
      .maybeSingle();
    const raw = (providerRow as { timezone?: string | null } | null)?.timezone ?? null;
    providerTimeZone = normalizeProviderTimezone(raw);
  } catch {
    // best-effort
  }

  const dateStr = calendarDateInProviderZoneForEval(input.scheduledAt, providerTimeZone);

  const { slotGrid, maxAdvanceExceeded } = await computeProviderBookingSlotGrid({
    supabase,
    providerId: input.providerId,
    dateStr,
    durationMinutes: Math.max(15, Math.min(480, input.durationMinutes)),
    staffIdsParam: input.staffIdsCsv,
    locationId: input.locationId,
    excludeBookingId: input.excludeBookingId,
    excludeHoldId: undefined,
    excludeGroupBookingId: input.excludeGroupBookingId,
    mode: input.mode,
    travelBufferRaw: input.travelBufferRaw,
    minNoticeMinutes: input.minNoticeMinutes,
    maxAdvanceDays: input.maxAdvanceDays,
    resourceOfferingIds: input.resourceOfferingIds,
  });

  const conflicts: string[] = [];
  if (maxAdvanceExceeded) {
    conflicts.push("This date is outside the allowed booking horizon");
  } else {
    const wallLabel = wallClockTimeLabelForEval(input.scheduledAt, providerTimeZone);
    const row = slotGrid.find((s) => s.time === wallLabel);
    if (!row) {
      conflicts.push("This time is not on the availability schedule for that day");
    } else if (!row.available) {
      conflicts.push(row.reason?.trim() || "Slot is not available (calendar / staff / resources)");
    }
  }

  return {
    ok: conflicts.length === 0,
    conflicts,
    providerTimeZone,
  };
}
