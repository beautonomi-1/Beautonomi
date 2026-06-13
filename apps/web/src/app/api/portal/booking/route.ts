import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { validatePortalToken } from "@/lib/portal/token";
import { checkPortalRateLimit } from "@/lib/rate-limit/portal";
import { applyRateLimitHeaders } from "@/lib/rate-limit/headers";
import { isShadowEmail } from "@/lib/users/shadow-email";

/**
 * GET /api/portal/booking
 *
 * Get booking details via portal token (passwordless access)
 */
export async function GET(request: NextRequest) {
  const rate = await checkPortalRateLimit(request);
  const { allowed } = rate;
  if (!allowed) {
    const response = handleApiError(
      new Error("Rate limit exceeded"),
      "Too many requests. Please try again later.",
      "RATE_LIMITED",
      429
    );
    return applyRateLimitHeaders(response, {
      limit: 30,
      remaining: rate.remaining,
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return handleApiError(
        new Error("Token required"),
        "Access token is required",
        "TOKEN_REQUIRED",
        400
      );
    }

    const supabase = await getSupabaseServer();
    const supabaseAdmin = getSupabaseAdmin();

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

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(`
        id,
        booking_number,
        scheduled_at,
        status,
        location_type,
        address_line1,
        address_city,
        address_state,
        address_postal_code,
        address_country,
        location_id,
        provider_id,
        customer_id,
        current_stage,
        provider_en_route_at,
        provider_arrived_at,
        estimated_arrival,
        provider_location,
        arrival_otp,
        arrival_otp_expires_at,
        arrival_otp_verified,
        qr_code_data,
        qr_code_expires_at,
        qr_code_verified,
        providers (
          id,
          business_name
        ),
        customers:users!bookings_customer_id_fkey (
          id,
          full_name,
          email,
          phone,
          is_shadow
        ),
        locations:provider_locations (
          id,
          name,
          address_line1,
          city
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
          staff:provider_staff (
            id,
            name
          )
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

    const bookingData = booking as Record<string, unknown>;
    const bookingServices = (booking.booking_services || []) as Array<Record<string, unknown>>;
    let totalDurationMinutes = 0;
    let staffId: string | null = null;
    for (const bs of bookingServices) {
      totalDurationMinutes += Number(bs.duration_minutes ?? 60);
      if (bs.staff_id && !staffId) staffId = bs.staff_id as string;
    }

    const providers = booking.providers as { business_name?: string } | { business_name?: string }[] | null;
    const providerRow = Array.isArray(providers) ? providers[0] : providers;
    const customers = booking.customers as {
      full_name?: string;
      email?: string;
      is_shadow?: boolean;
    } | {
      full_name?: string;
      email?: string;
      is_shadow?: boolean;
    }[] | null;
    const customerRow = Array.isArray(customers) ? customers[0] : customers;
    const locations = booking.locations as { name?: string; address_line1?: string; city?: string } | null;
    const locationRow = Array.isArray(locations) ? locations[0] : locations;

    const customerEmail = customerRow?.email ?? "";
    const customerIsShadow =
      customerRow?.is_shadow === true || isShadowEmail(customerEmail);

    const showArrivalSecrets =
      bookingData.location_type === "at_home" &&
      bookingData.current_stage === "provider_arrived" &&
      !bookingData.arrival_otp_verified;

    const bookingPayload: Record<string, unknown> = {
      id: booking.id,
      booking_number: booking.booking_number,
      scheduled_at: booking.scheduled_at,
      status: booking.status,
      location_type: booking.location_type,
      address: booking.address_line1
        ? {
            line1: booking.address_line1,
            city: booking.address_city,
            state: booking.address_state,
            postal_code: booking.address_postal_code,
            country: booking.address_country,
          }
        : undefined,
      location: locationRow
        ? {
            name: locationRow.name,
            address: [locationRow.address_line1, locationRow.city].filter(Boolean).join(", "),
          }
        : null,
      provider: {
        name: providerRow?.business_name || "Provider",
      },
      customer: {
        name: customerRow?.full_name || "Guest",
        email: customerEmail,
        is_shadow: customerIsShadow,
      },
      services: bookingServices.map((bs) => {
        const offering = bs.offerings as { title?: string } | null;
        const staff = bs.staff as { name?: string } | null;
        return {
          title: offering?.title || "Service",
          duration_minutes: bs.duration_minutes,
          staff_name: staff?.name,
        };
      }),
      staff_id: staffId,
      total_duration_minutes: totalDurationMinutes || 60,
      current_stage: bookingData.current_stage ?? null,
      provider_en_route_at: bookingData.provider_en_route_at ?? null,
      provider_arrived_at: bookingData.provider_arrived_at ?? null,
      estimated_arrival: bookingData.estimated_arrival ?? null,
      provider_location: bookingData.provider_location ?? null,
      arrival_otp_verified: bookingData.arrival_otp_verified ?? false,
      qr_code_verified: bookingData.qr_code_verified ?? false,
      arrival_otp_expires_at: bookingData.arrival_otp_expires_at ?? null,
      qr_code_expires_at: bookingData.qr_code_expires_at ?? null,
    };

    if (showArrivalSecrets && bookingData.arrival_otp != null) {
      bookingPayload.arrival_otp = bookingData.arrival_otp;
    }

    if (
      showArrivalSecrets &&
      !bookingData.qr_code_verified &&
      bookingData.qr_code_data != null
    ) {
      bookingPayload.qr_code_data = bookingData.qr_code_data;
    }

    return successResponse(bookingPayload);
  } catch (error) {
    return handleApiError(error, "Failed to load booking");
  }
}
