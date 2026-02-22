import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission"; // Fixed: moved from api-helpers to auth/requirePermission

/**
 * GET /api/provider/ratings/list
 * 
 * Get list of provider-to-client ratings (for viewing/editing)
 * Returns individual ratings with booking information
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission('view_client_ratings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get("customer_id");
    const locationId = searchParams.get("location_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query for individual ratings
    let query = supabase
      .from("provider_client_ratings")
      .select(`
        id,
        booking_id,
        customer_id,
        location_id,
        rating,
        comment,
        is_visible,
        created_at,
        updated_at,
        bookings:bookings!provider_client_ratings_booking_id_fkey(
          id,
          booking_number,
          scheduled_at,
          completed_at,
          status
        )
      `)
      .eq("provider_id", providerId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    if (locationId) {
      query = query.eq("location_id", locationId);
    }

    const { data: ratings, error } = await query;

    if (error) throw error;

    // Transform ratings to include booking info
    const transformedRatings = (ratings || []).map((rating: any) => ({
      id: rating.id,
      booking_id: rating.booking_id,
      booking_number: rating.bookings?.booking_number || null,
      customer_id: rating.customer_id,
      location_id: rating.location_id,
      rating: rating.rating,
      comment: rating.comment,
      is_visible: rating.is_visible,
      created_at: rating.created_at,
      updated_at: rating.updated_at,
      scheduled_at: rating.bookings?.scheduled_at || null,
      completed_at: rating.bookings?.completed_at || null,
      booking_status: rating.bookings?.status || null,
    }));

    return successResponse({
      ratings: transformedRatings,
      total: transformedRatings.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch ratings");
  }
}
