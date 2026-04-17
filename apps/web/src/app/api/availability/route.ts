import { NextRequest } from "next/server";
import { isUuidString, SYNTHETIC_PROVIDER_STAFF_PREFIX } from "@beautonomi/utils";
import {
  availabilitySlotsAsTimeSlots,
  computePublicSlugAvailabilitySlots,
} from "@/lib/availability/public-slug-availability-engine";
import { parseSyntheticProviderStaffId } from "@/lib/availability/load-constraints";
import type { TimeSlot } from "@/lib/availability/types";
import {
  getProviderIdForUser,
  handleApiError,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/availability
 *
 * Available time slots for a staff member on a specific date.
 *
 * B12: this route now delegates to the same engine as the public-slug
 * availability endpoint (`/api/public/providers/[slug]/availability`) and the
 * portal reschedule endpoint (`/api/portal/availability`) via
 * {@link computePublicSlugAvailabilitySlots}. We flatten the shared
 * `AvailabilitySlot[]` contract back to the legacy `{ time, available }` shape
 * for existing callers (`/booking` step-calendar, mobile `AvailabilitySlotPicker`)
 * through {@link availabilitySlotsAsTimeSlots}. New callers should use
 * `/api/public/providers/[slug]/availability` directly (ISO start/end + staff_id).
 *
 * Query params: staffId, providerId, date, mode, duration, travelBuffer,
 *   avoidGaps (unused — now honoured via providerSettings.avoidGaps),
 *   excludeHoldId, locationId, excludeBookingId.
 *
 * **`staffId=any` (or omitted):** returns **no slots** unless **`providerId`** (provider UUID)
 * is passed — then slots are the **union** of availability across active staff
 * (or the synthetic solo `provider-{uuid}` staff when the provider has no
 * `provider_staff` rows), matching the public slug endpoint.
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
    const excludeHoldId =
      searchParams.get("excludeHoldId")?.trim() || undefined;
    const excludeBookingId =
      searchParams.get("exclude_booking_id")?.trim() || undefined;
    const locationId = searchParams.get("locationId")?.trim() || undefined;

    if (!date) {
      return successResponse({ date, slots: [] });
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return handleApiError(
        new Error("Database connection failed"),
        "Failed to connect to database",
      );
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

    // Resolve the provider id the shared engine needs. For explicit staff ids
    // we look up the provider row so settings (avoid_gaps, timezone) and
    // calendar-parity data are honoured. For any-staff requests the caller
    // must pass providerId (same rule as before).
    let providerIdForEngine: string | undefined = providerIdParam;
    if (!providerIdForEngine && !wantsAnyStaff) {
      const synthetic = parseSyntheticProviderStaffId(staffIdTrim);
      if (synthetic) {
        providerIdForEngine = synthetic;
      } else if (!staffIdTrim.startsWith(SYNTHETIC_PROVIDER_STAFF_PREFIX)) {
        const admin = getSupabaseAdmin();
        const { data: staffRow } = await admin
          .from("provider_staff")
          .select("provider_id")
          .eq("id", staffIdTrim)
          .maybeSingle();
        providerIdForEngine = staffRow?.provider_id ?? undefined;
      }
    }

    // Any-staff requires providerId (same contract as before).
    if (wantsAnyStaff && (!providerIdForEngine || !isUuidString(providerIdForEngine))) {
      return successResponse({ date, slots: [] });
    }

    // Load active staff rows when doing an any-staff union. Mirrors the same
    // query as the public slug endpoint so both routes converge.
    let activeStaffRows: Array<{ id: string }> = [];
    if (wantsAnyStaff && providerIdForEngine) {
      const { data: staffRows } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("provider_id", providerIdForEngine)
        .eq("is_active", true);
      activeStaffRows = (staffRows || []).map((r: { id: string }) => ({
        id: r.id,
      }));
    }

    if (!providerIdForEngine) {
      // No provider context available — the shared engine requires it.
      return successResponse({ date, slots: [] });
    }

    const publicSlots = await computePublicSlugAvailabilitySlots({
      supabase,
      providerId: providerIdForEngine,
      date,
      totalBlockedMinutes: Number.isFinite(duration) && duration > 0 ? duration : 60,
      travelBufferMinutes:
        mode === "mobile" && Number.isFinite(travelBuffer) && travelBuffer >= 0
          ? Math.min(360, travelBuffer)
          : 0,
      locationId: locationId ?? null,
      staffIdParam: wantsAnyStaff ? "any" : staffIdTrim,
      activeStaffRows,
      excludeHoldId,
      excludeBookingId,
    });

    const slots: TimeSlot[] = availabilitySlotsAsTimeSlots(publicSlots);

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
