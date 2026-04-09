import { NextRequest } from "next/server";
import { isUuidString, SYNTHETIC_PROVIDER_STAFF_PREFIX } from "@beautonomi/utils";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import {
  loadAvailabilityConstraints,
  parseSyntheticProviderStaffId,
} from "@/lib/availability/load-constraints";
import { mergeUnionAnyStaffSlots } from "@/lib/availability/merge-any-staff-slots";
import type { TimeSlot } from "@/lib/availability/types";
import { getProviderIdForUser, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Cap union queries so one request cannot fan out unbounded. */
const MAX_STAFF_IDS_FOR_ANY = 35;

async function computeSlotsForStaff(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  staffId: string,
  date: string,
  mode: string,
  duration: number,
  travelBuffer: number,
  avoidGaps: boolean,
  excludeHoldId?: string,
  /** All active staff IDs for the provider — used for time-off/day-off parity queries. */
  allStaffIdsForParity?: string[]
): Promise<TimeSlot[]> {
  let providerIdForSettings: string | undefined;
  const syntheticProviderId = parseSyntheticProviderStaffId(staffId);
  if (syntheticProviderId) {
    providerIdForSettings = syntheticProviderId;
  } else if (!staffId.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX)) {
    const { data: staffRow } = await supabase
      .from("provider_staff")
      .select("provider_id")
      .eq("id", staffId)
      .maybeSingle();
    providerIdForSettings = staffRow?.provider_id ?? undefined;
  }

  const constraints = await loadAvailabilityConstraints(
    supabase,
    staffId,
    date,
    providerIdForSettings,
    {
      excludeHoldId,
      // Mirror the public slug availability route: apply staff_days_off, staff_time_off,
      // and availability_blocks so the web booking flow honours the same blocks as the
      // customer mobile app and the portal reschedule flow.
      ...(providerIdForSettings
        ? {
            publicCalendarParity: {
              providerId: providerIdForSettings,
              date,
              locationId: undefined,
              slotStaffId: staffId,
              staffIdsForTimeOff: allStaffIdsForParity ?? (staffId ? [staffId] : undefined),
            },
          }
        : {}),
    }
  );

  return calculateAvailableSlots(
    constraints,
    duration,
    date,
    {
      slotInterval: 15,
      avoidGaps,
      travelBuffer: mode === "mobile" ? travelBuffer : 0,
    }
  );
}

/**
 * GET /api/availability
 *
 * Get available time slots for a staff member on a specific date.
 * Uses loadAvailabilityConstraints + calculateAvailableSlots (same pipeline as
 * portal/me reschedule). For duration, pass total blocked minutes (e.g. sum of
 * service durations + buffers) so slots match the book flow.
 *
 * Query params: staffId, date, mode, duration, travelBuffer, avoidGaps, excludeHoldId
 *
 * **`staffId=any` (or omitted):** returns **no slots** unless **`providerId`** (provider UUID)
 * is passed — then slots are the **union** of availability across active staff (or the
 * synthetic solo `provider-{uuid}` staff when the provider has no `provider_staff` rows).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffIdRaw = searchParams.get("staffId");
    const providerIdParam = searchParams.get("providerId")?.trim() || undefined;
    const date = searchParams.get("date");
    const mode = searchParams.get("mode") || "salon";
    const duration = parseInt(searchParams.get("duration") || "60", 10);
    const travelBuffer = parseInt(searchParams.get("travelBuffer") || "0", 10);
    const avoidGaps = searchParams.get("avoidGaps") === "true";
    const excludeHoldId = searchParams.get("excludeHoldId")?.trim() || undefined;

    if (!date) {
      return successResponse({ date, slots: [] });
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return handleApiError(new Error("Database connection failed"), "Failed to connect to database");
    }

    let authenticatedProviderId: string | null = null;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        authenticatedProviderId = await getProviderIdForUser(user.id, supabase);
      }
    } catch {
      // Auth is optional — swallow errors and continue as public
    }

    const staffIdTrim = staffIdRaw?.trim() ?? "";
    const wantsAnyStaff = !staffIdTrim || staffIdTrim === "any";

    let slots: TimeSlot[];

    if (wantsAnyStaff) {
      if (!providerIdParam || !isUuidString(providerIdParam)) {
        return successResponse({ date, slots: [] });
      }

      const { data: staffRows } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("provider_id", providerIdParam)
        .eq("is_active", true)
        .limit(MAX_STAFF_IDS_FOR_ANY);

      const ids = (staffRows || []).map((r: { id: string }) => r.id);
      const staffIdsToScan =
        ids.length > 0 ? ids : [`${SYNTHETIC_PROVIDER_STAFF_PREFIX}${providerIdParam}`];

      const slotArrays = await Promise.all(
        staffIdsToScan.map((sid) =>
          computeSlotsForStaff(
            supabase,
            sid,
            date,
            mode,
            duration,
            travelBuffer,
            avoidGaps,
            excludeHoldId,
            ids.length > 0 ? ids : undefined
          )
        )
      );
      slots = mergeUnionAnyStaffSlots(slotArrays);
    } else {
      slots = await computeSlotsForStaff(
        supabase,
        staffIdTrim,
        date,
        mode,
        duration,
        travelBuffer,
        avoidGaps,
        excludeHoldId
        // allStaffIdsForParity: undefined — will default to [staffIdTrim] inside
      );
    }

    const response: Record<string, unknown> = {
      date,
      slots,
    };

    if (authenticatedProviderId) {
      response.provider_context = {
        provider_id: authenticatedProviderId,
        is_own_staff: true,
        slot_count: slots.length,
      };
    }

    return successResponse(response);
  } catch (error) {
    console.error("Error calculating availability:", error);
    return handleApiError(error, "Failed to fetch availability");
  }
}
