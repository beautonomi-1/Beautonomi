import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { loadAvailabilityConstraints } from "@/lib/availability/load-constraints";
import { calculateAvailableSlots } from "@/lib/availability/calculate-slots";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";

/**
 * GET /api/portal/availability
 *
 * Get available time slots for rescheduling via portal token
 * Query params: token, date
 */
export async function GET(request: NextRequest) {
  const { allowed } = checkPortalRateLimit(request);
  if (!allowed) {
    return handleApiError(
      new Error("Rate limit exceeded"),
      "Too many requests. Please try again later.",
      "RATE_LIMITED",
      429
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const date = searchParams.get("date");

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400
      );
    }

    if (!date) {
      return successResponse({ date: "", slots: [] });
    }

    const supabase = await getSupabaseServer();
    const validation = await validatePortalToken(supabase, token);

    if (!validation.isValid || !validation.bookingId) {
      return handleApiError(
        new Error(validation.reason || "Invalid token"),
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401
      );
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        id,
        location_type,
        booking_services (
          staff_id,
          duration_minutes,
          offerings (duration_minutes, buffer_minutes)
        )
      `)
      .eq("id", validation.bookingId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    const services = (booking.booking_services || []) as any[];
    const firstService = services[0];
    const staffId = firstService?.staff_id;

    if (!staffId) {
      return successResponse({ date, slots: [] });
    }

    let totalDuration = 0;
    for (const bs of services) {
      totalDuration += bs.duration_minutes || bs.offerings?.duration_minutes || 60;
    }
    totalDuration = totalDuration || 60;

    const constraints = await loadAvailabilityConstraints(supabase, staffId, date);
    const travelBuffer = booking.location_type === "at_home" ? 30 : 0;

    const slots = calculateAvailableSlots(constraints, totalDuration, date, {
      slotInterval: 15,
      travelBuffer,
    });

    return successResponse({ date, slots });
  } catch (error) {
    return handleApiError(error, "Failed to fetch availability");
  }
}
