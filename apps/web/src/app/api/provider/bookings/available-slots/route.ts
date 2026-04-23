import { NextRequest } from "next/server";
import { computeProviderBookingSlotGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/provider/bookings/available-slots?date=YYYY-MM-DD&duration_minutes=60&staff_ids=id1,id2&location_id=...
 *
 * B12 parity: {@link computeProviderBookingSlotGrid} → `computePublicSlugAvailabilitySlots` (same engine as
 * `/api/availability` and public slug availability).
 *
 * Response: `slots` (available HH:mm only, backward compatible), `slot_grid`, `provider_timezone`, `date`.
 *
 * Query params:
 * - `mode`: `salon` (default) | `mobile` — mobile applies travel buffer.
 * - `travel_buffer`: minutes when `mode=mobile` (optional; defaults to house-call default when omitted).
 * - `service_ids` / `service_id`: offering UUIDs for required-resource parity.
 * - `min_notice_minutes`, `max_advance_days`: optional filters (default 0 / 365).
 * - `exclude_booking_id`, `exclude_hold_id`: reschedule / hold parity.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const sp = request.nextUrl.searchParams;
    const dateStr = sp.get("date");
    const durationMinutes = Math.max(15, Math.min(480, parseInt(sp.get("duration_minutes") || "60", 10)));
    const staffIdsParam = sp.get("staff_ids");
    const locationIdRaw = sp.get("location_id")?.trim();
    const locationId = locationIdRaw && locationIdRaw.length > 0 ? locationIdRaw : null;
    const excludeBookingId = sp.get("exclude_booking_id")?.trim() || undefined;
    const excludeHoldId = sp.get("exclude_hold_id")?.trim() || undefined;

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return handleApiError(new Error("date is required (YYYY-MM-DD)"), "VALIDATION_ERROR", 400);
    }

    const mode = (sp.get("mode") || "salon").toLowerCase() === "mobile" ? "mobile" : "salon";
    const travelBufferRaw = sp.get("travel_buffer");

    const minNoticeMinutes = parseInt(sp.get("min_notice_minutes") || sp.get("minNoticeMinutes") || "0", 10);
    const maxAdvanceDays = parseInt(sp.get("max_advance_days") || sp.get("maxAdvanceDays") || "365", 10);

    const serviceIdParam = sp.get("service_id")?.trim() || null;
    const serviceIdsParam = sp.get("service_ids");
    const orderedOfferingIds =
      serviceIdsParam
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const resourceOfferingIds =
      orderedOfferingIds.length > 0 ? orderedOfferingIds : serviceIdParam ? [serviceIdParam] : [];

    const { providerTimeZone, slotGrid, maxAdvanceExceeded } = await computeProviderBookingSlotGrid({
      supabase: supabaseAdmin,
      providerId,
      dateStr,
      durationMinutes,
      staffIdsParam,
      locationId,
      excludeBookingId,
      excludeHoldId,
      mode,
      travelBufferRaw,
      minNoticeMinutes,
      maxAdvanceDays,
      resourceOfferingIds,
    });

    if (maxAdvanceExceeded) {
      return successResponse({
        date: dateStr,
        slots: [] as string[],
        slot_grid: [] as Array<{ time: string; available: boolean; reason?: string }>,
        provider_timezone: null as string | null,
      });
    }

    const slots = slotGrid.filter((s) => s.available).map((s) => s.time);

    return successResponse({
      date: dateStr,
      slots,
      slot_grid: slotGrid.map(({ time, available, reason }) =>
        reason ? { time, available, reason } : { time, available },
      ),
      provider_timezone: providerTimeZone,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get available slots");
  }
}
