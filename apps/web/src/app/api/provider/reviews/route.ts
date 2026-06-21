import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/reviews
 * 
 * Get all reviews for provider's business
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_reviews", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    
    // Use service role client for better performance
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return successResponse({ reviews: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "all"; // 'all', 'pending_response', 'responded'
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50"); // Increased default limit
    const offset = (page - 1) * limit;

    // Reviews are intentionally business-wide and are NOT scoped to a branch.
    // A review attaches to a booking, but `bookings.location_id` is frequently
    // null (legacy bookings, freelancer/mobile bookings, accounts created before
    // multi-location tracking). Filtering by `location_id` therefore silently
    // dropped legitimate reviews and produced an empty list even though the
    // business-wide rating aggregate (`providers.review_count`) still counted
    // them. The web portal and customer-facing profile have always shown reviews
    // business-wide, so we deliberately ignore any `location_id` param here to
    // keep every surface consistent and avoid that empty-list trap.

    // Build base query with count
    let query = supabaseAdmin
      .from("reviews")
      .select(`
        *,
        customer:users!reviews_customer_id_fkey(
          id,
          full_name,
          email
        ),
        booking:bookings!reviews_booking_id_fkey(
          id,
          booking_number,
          scheduled_at
        )
      `, { count: "exact" })
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    // Filter by response status
    if (status === 'pending_response') {
      query = query.is("provider_response", null);
    } else if (status === 'responded') {
      query = query.not("provider_response", "is", null);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data: reviews, error, count } = await query;

    if (error) {
      throw error;
    }

    // Data is already in the correct format from the query
    const formattedReviews = reviews || [];

    return successResponse({
      reviews: formattedReviews,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/provider/reviews:", error);
    return handleApiError(error, "Failed to fetch reviews");
  }
}
