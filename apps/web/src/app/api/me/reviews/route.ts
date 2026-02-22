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
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data: reviews, error } = await supabase
      .from("reviews")
      .select(`
        id,
        booking_id,
        provider_id,
        rating,
        comment,
        photos,
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
          thumbnail_url
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return successResponse({
      reviews: reviews || [],
      total: reviews?.length || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch reviews");
  }
}
