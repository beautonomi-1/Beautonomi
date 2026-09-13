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

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    let query = supabase
      .from("bookings")
      .select("id, scheduled_at")
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("scheduled_at", startOfDay.toISOString())
      .lte("scheduled_at", endOfDay.toISOString());

    if (locationId) {
      query = query.or(dashboardBookingLocationOrFilter(locationId));
    }

    const { data: bookings, error } = await query;
    if (error) throw error;

    let notified = 0;
    for (const booking of bookings ?? []) {
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
