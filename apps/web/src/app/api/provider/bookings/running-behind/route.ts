import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { notifyProviderRunningLate } from "@/lib/notifications/notification-service";
import {
  dashboardBookingLocationOrFilter,
  normalizeDashboardLocationId,
} from "@/lib/server/provider/dashboard-booking-location-filter";
import { dateRangeBoundsUtc, formatDateYmd, resolveTz } from "@/lib/dates/provider-tz";
import { anyEligibleForRunningBehindNotify } from "@beautonomi/provider-booking";

/**
 * POST /api/provider/bookings/running-behind
 * Broadcast a salon delay to remaining confirmed customers today.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = (await request.json()) as {
      location_id?: string;
      delay_minutes?: number;
    };
    const delayMinutes = Number(body.delay_minutes);
    const locationId = normalizeDashboardLocationId(body.location_id ?? null);

    if (!Number.isFinite(delayMinutes) || delayMinutes <= 0 || delayMinutes > 180) {
      return errorResponse("Invalid delay_minutes", "VALIDATION_ERROR", 400);
    }

    const { data: providerRow } = await supabase
      .from("providers")
      .select("timezone")
      .eq("id", providerId)
      .maybeSingle();
    const tz = resolveTz((providerRow as { timezone?: string | null } | null)?.timezone);
    const todayYmd = formatDateYmd(new Date(), tz);
    const { fromIso, toIso } = dateRangeBoundsUtc(todayYmd, todayYmd, tz);
    const nowMs = Date.now();

    let query = supabase
      .from("bookings")
      .select("id, scheduled_at, status")
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso);

    if (locationId) {
      query = query.or(dashboardBookingLocationOrFilter(locationId));
    }

    const { data: bookings, error } = await query;
    if (error) throw error;

    let notified = 0;
    for (const booking of bookings ?? []) {
      if (
        !anyEligibleForRunningBehindNotify(
          [{ status: booking.status, scheduled_at: booking.scheduled_at }],
          nowMs,
        )
      ) {
        continue;
      }
      const newArrival = addMinutes(new Date(String(booking.scheduled_at)), delayMinutes);
      await notifyProviderRunningLate(String(booking.id), delayMinutes, newArrival);
      notified += 1;
    }

    try {
      const { trackServer } = await import("@/lib/analytics/amplitude/server");
      const { EVENT_SALON_RUNNING_BEHIND_BROADCAST } = await import(
        "@/lib/analytics/amplitude/types"
      );
      await trackServer(
        EVENT_SALON_RUNNING_BEHIND_BROADCAST,
        {
          provider_id: providerId,
          location_id: locationId,
          delay_minutes: delayMinutes,
          notified,
        },
        user.id,
        { insertId: `salon_running_behind:${providerId}:${new Date().toISOString().slice(0, 13)}` },
      );
    } catch {
      // analytics is non-blocking
    }

    return successResponse({ notified, delay_minutes: delayMinutes });
  } catch (error) {
    return handleApiError(error, "Failed to broadcast running behind");
  }
}
