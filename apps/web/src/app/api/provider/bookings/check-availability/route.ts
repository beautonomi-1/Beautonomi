import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/provider/bookings/check-availability
 *
 * Pre-flight for provider-created / rescheduled bookings. Delegates calendar validity to
 * {@link evaluateProviderSlotAgainstGrid} (same engine as `/available-slots`). Also checks
 * active customer holds (checkout in progress).
 *
 * Clients must send `duration_minutes` equal to the total wall-clock span of all `booking_services`
 * segments (same as POST/PATCH sequential windows).
 *
 * Query params: `scheduled_at`, `duration_minutes`, `staff_ids`, `location_id`, `exclude_booking_id`,
 * `offering_ids`, `mode`, `travel_buffer`, `min_notice_minutes`, `max_advance_days`.
 */

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const sp = request.nextUrl.searchParams;
    const scheduledAtRaw = sp.get("scheduled_at");
    const durationMinutes = parseInt(sp.get("duration_minutes") || "60", 10);
    const staffIdsParam = sp.get("staff_ids");
    const locationId = sp.get("location_id")?.trim() || null;
    const excludeBookingId = sp.get("exclude_booking_id")?.trim() || undefined;
    const offeringIdsParam = sp.get("offering_ids");
    const offeringIds = offeringIdsParam ? offeringIdsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const mode = (sp.get("mode") || "salon").toLowerCase() === "mobile" ? "mobile" : "salon";
    const travelBufferRaw = sp.get("travel_buffer");
    const minNoticeMinutes = parseInt(sp.get("min_notice_minutes") || sp.get("minNoticeMinutes") || "0", 10);
    const maxAdvanceDays = parseInt(sp.get("max_advance_days") || sp.get("maxAdvanceDays") || "365", 10);

    if (!scheduledAtRaw) {
      return handleApiError(new Error("scheduled_at is required"), "scheduled_at is required", "VALIDATION_ERROR", 400);
    }

    const startTime = new Date(scheduledAtRaw);
    if (Number.isNaN(startTime.getTime())) {
      return handleApiError(new Error("scheduled_at is invalid"), "scheduled_at is invalid", "VALIDATION_ERROR", 400);
    }

    const endTime = addMinutes(startTime, durationMinutes);

    const conflicts: string[] = [];

    const staffIds = staffIdsParam ? staffIdsParam.split(",").filter(Boolean) : [];
    const holdStaffId = staffIds.length === 1 ? staffIds[0] : null;
    const holdBlocked = await checkActiveHoldOverlap(supabaseAdmin, providerId, startTime, endTime, {
      dbStaffId: holdStaffId,
    });
    if (holdBlocked) {
      conflicts.push("Another customer is holding this time slot (checkout in progress)");
    }

    const gridEval = await evaluateProviderSlotAgainstGrid(supabaseAdmin, {
      providerId,
      scheduledAt: startTime,
      durationMinutes: Math.max(15, Math.min(480, durationMinutes)),
      staffIdsCsv: staffIdsParam,
      locationId,
      excludeBookingId,
      mode,
      travelBufferRaw,
      minNoticeMinutes,
      maxAdvanceDays,
      resourceOfferingIds: offeringIds,
    });

    if (!gridEval.ok) {
      conflicts.push(...gridEval.conflicts);
    }

    const dedupedConflicts = Array.from(new Set(conflicts));
    return successResponse({
      available: dedupedConflicts.length === 0,
      conflicts: dedupedConflicts,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check availability");
  }
}
