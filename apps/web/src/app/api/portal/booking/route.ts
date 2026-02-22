import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken, usePortalToken } from "@/lib/portal/token";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";

/**
 * GET /api/portal/booking
 *
 * Get booking details via portal token (passwordless access)
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
    const token = searchParams.get('token');

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400
      );
    }

    const supabase = await getSupabaseServer();

    // Validate token
    const validation = await validatePortalToken(supabase, token);
    if (!validation.isValid) {
      return handleApiError(
        new Error(validation.reason || "Invalid token"),
        validation.reason || "Invalid or expired access token",
        "INVALID_TOKEN",
        401
      );
    }

    if (!validation.bookingId) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    // Load booking with related data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_number,
        scheduled_at,
        status,
        location_type,
        address,
        location_id,
        provider_id,
        customer_id,
        providers (
          id,
          name
        ),
        customers (
          id,
          name,
          email
        ),
        locations (
          id,
          name,
          address
        ),
        booking_services (
          id,
          offering_id,
          staff_id,
          duration_minutes,
          scheduled_start_at,
          scheduled_end_at,
          offerings (
            id,
            title
          ),
          staff (
            id,
            name
          )
        )
      `)
      .eq('id', validation.bookingId)
      .single();

    if (bookingError || !booking) {
      return handleApiError(
        new Error("Booking not found"),
        "Booking not found",
        "NOT_FOUND",
        404
      );
    }

    // Calculate total duration for reschedule
    const bookingServices = (booking.booking_services || []) as any[];
    let totalDurationMinutes = 0;
    let staffId: string | null = null;
    for (const bs of bookingServices) {
      totalDurationMinutes += bs.duration_minutes || bs.offerings?.duration_minutes || 60;
      if (bs.staff_id && !staffId) staffId = bs.staff_id;
    }

    // Transform booking data for frontend
    const bookingData = {
      id: booking.id,
      booking_number: booking.booking_number,
      scheduled_at: booking.scheduled_at,
      status: booking.status,
      location_type: booking.location_type,
      address: booking.address,
      location: booking.locations ? {
        name: (Array.isArray(booking.locations) ? booking.locations[0] : booking.locations)?.name,
        address: (Array.isArray(booking.locations) ? booking.locations[0] : booking.locations)?.address,
      } : null,
      provider: {
        name: (Array.isArray(booking.providers) ? booking.providers[0] : booking.providers)?.name || 'Unknown',
      },
      customer: {
        name: (Array.isArray(booking.customers) ? booking.customers[0] : booking.customers)?.name || 'Guest',
        email: (Array.isArray(booking.customers) ? booking.customers[0] : booking.customers)?.email || '',
      },
      services: bookingServices.map((bs: any) => ({
        title: bs.offerings?.title || 'Service',
        duration_minutes: bs.duration_minutes,
        staff_name: bs.staff?.name,
      })),
      staff_id: staffId,
      total_duration_minutes: totalDurationMinutes || 60,
    };

    // Mark token as used (if single-use)
    await usePortalToken(supabase, token);

    return successResponse(bookingData);
  } catch (error) {
    return handleApiError(error, "Failed to load booking");
  }
}
