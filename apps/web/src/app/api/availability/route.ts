import { NextRequest } from "next/server";
import { SYNTHETIC_PROVIDER_STAFF_PREFIX } from "@beautonomi/utils";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import {
  loadAvailabilityConstraints,
  parseSyntheticProviderStaffId,
} from "@/lib/availability/load-constraints";
import { getProviderIdForUser, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/availability
 *
 * Get available time slots for a staff member on a specific date.
 * Uses loadAvailabilityConstraints + calculateAvailableSlots (same pipeline as
 * portal/me reschedule). For duration, pass total blocked minutes (e.g. sum of
 * service durations + buffers) so slots match the book flow.
 * Query params: staffId, date, mode, duration, travelBuffer, avoidGaps, excludeHoldId
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get("staffId");
    const date = searchParams.get("date");
    const mode = searchParams.get("mode") || "salon";
    const duration = parseInt(searchParams.get("duration") || "60");
    const travelBuffer = parseInt(searchParams.get("travelBuffer") || "0");
    const avoidGaps = searchParams.get("avoidGaps") === "true";
    const excludeHoldId = searchParams.get("excludeHoldId")?.trim() || undefined;

    if (!date) {
      return successResponse({ date, slots: [] });
    }

    if (!staffId || staffId === "any") {
      return successResponse({ date, slots: [] });
    }

    const supabase = await getSupabaseServer();
    if (!supabase) {
      return handleApiError(new Error("Database connection failed"), "Failed to connect to database");
    }

    // --- Optional auth: enrich response for authenticated users ---
    let authenticatedProviderId: string | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        authenticatedProviderId = await getProviderIdForUser(user.id, supabase);
      }
    } catch {
      // Auth is optional — swallow errors and continue as public
    }

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

    // Uses service role when configured so customers see shifts + all bookings on this staff (RLS would hide them).
    const constraints = await loadAvailabilityConstraints(
      supabase,
      staffId,
      date,
      providerIdForSettings,
      { excludeHoldId }
    );

    // Calculate available slots
    const slots = calculateAvailableSlots(
      constraints,
      duration,
      date,
      {
        slotInterval: 15,
        avoidGaps,
        travelBuffer: mode === "mobile" ? travelBuffer : 0,
      }
    );

    // Build response — enrich when the caller is an authenticated provider/staff member
    const response: Record<string, any> = {
      date,
      slots,
    };

    if (authenticatedProviderId) {
      // Authenticated provider/staff: include provider-specific context
      // so the front-end can show richer booking UI (e.g. internal notes, buffer info)
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
