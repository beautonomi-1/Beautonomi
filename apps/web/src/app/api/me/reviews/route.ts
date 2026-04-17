import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/reviews
 * 
 * Get all reviews by the current user
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const bookingIdFilter = searchParams.get("booking_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (bookingIdFilter) {
      const { data: review, error: oneError } = await supabase
        .from("reviews")
        .select(`
        id,
        booking_id,
        provider_id,
        rating,
        comment,
        photos,
        service_ratings,
        staff_rating,
        is_verified,
        created_at,
        updated_at,
        bookings (
          id,
          booking_number,
          scheduled_at,
          status
        ),
        providers (
          id,
          business_name,
          thumbnail_url,
          avatar_url
        )
      `)
        .eq("customer_id", user.id)
        .eq("booking_id", bookingIdFilter)
        .maybeSingle();

      if (oneError) {
        throw oneError;
      }

      return successResponse({
        review: review ?? null,
        reviews: review ? [review] : [],
        total: review ? 1 : 0,
      });
    }

    const { data: reviews, error, count } = await supabase
      .from("reviews")
      .select(`
        id,
        booking_id,
        provider_id,
        rating,
        comment,
        photos,
        service_ratings,
        staff_rating,
        is_verified,
        provider_response,
        provider_response_at,
        created_at,
        updated_at,
        bookings (
          id,
          booking_number,
          scheduled_at,
          status
        ),
        providers (
          id,
          business_name,
          thumbnail_url,
          avatar_url
        )
      `, { count: "exact" })
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return successResponse({
      reviews: reviews || [],
      total: count ?? reviews?.length ?? 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch reviews");
  }
}
