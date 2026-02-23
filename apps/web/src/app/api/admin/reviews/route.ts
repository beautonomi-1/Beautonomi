import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/reviews
 * 
 * Fetch all reviews with filtering and pagination. Uses admin client to bypass RLS.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status"); // all, visible, hidden, flagged
    const rating = searchParams.get("rating"); // 1-5
    const providerId = searchParams.get("provider_id");
    const customerId = searchParams.get("customer_id");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("reviews")
      .select(`
        id,
        booking_id,
        customer_id,
        provider_id,
        rating,
        comment,
        service_ratings,
        staff_rating,
        provider_response,
        provider_response_at,
        is_verified,
        is_flagged,
        flagged_reason,
        flagged_by,
        is_visible,
        helpful_count,
        created_at,
        updated_at,
        customer:users!reviews_customer_id_fkey(id, full_name, email, avatar_url),
        provider:providers!reviews_provider_id_fkey(id, business_name, thumbnail_url),
        booking:bookings(id, booking_number, status)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (status === "visible") {
      query = query.eq("is_visible", true);
    } else if (status === "hidden") {
      query = query.eq("is_visible", false);
    } else if (status === "flagged") {
      query = query.eq("is_flagged", true);
    }

    if (rating) {
      query = query.eq("rating", parseInt(rating));
    }

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const { data: reviews, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    let countQuery = supabase.from("reviews").select("*", { count: "exact", head: true });

    if (status === "visible") {
      countQuery = countQuery.eq("is_visible", true);
    } else if (status === "hidden") {
      countQuery = countQuery.eq("is_visible", false);
    } else if (status === "flagged") {
      countQuery = countQuery.eq("is_flagged", true);
    }

    if (rating) {
      countQuery = countQuery.eq("rating", parseInt(rating));
    }

    if (providerId) {
      countQuery = countQuery.eq("provider_id", providerId);
    }

    if (customerId) {
      countQuery = countQuery.eq("customer_id", customerId);
    }

    const { count } = await countQuery;

    // Get statistics
    const { data: stats } = await supabase
      .from("reviews")
      .select("rating, is_visible, is_flagged");

    const statistics = {
      total: stats?.length || 0,
      visible: stats?.filter((r) => r.is_visible).length || 0,
      hidden: stats?.filter((r) => !r.is_visible).length || 0,
      flagged: stats?.filter((r) => r.is_flagged).length || 0,
      average_rating: stats?.length
        ? (stats.reduce((sum, r) => sum + (r.rating || 0), 0) / stats.length).toFixed(2)
        : "0.00",
      rating_distribution: {
        5: stats?.filter((r) => r.rating === 5).length || 0,
        4: stats?.filter((r) => r.rating === 4).length || 0,
        3: stats?.filter((r) => r.rating === 3).length || 0,
        2: stats?.filter((r) => r.rating === 2).length || 0,
        1: stats?.filter((r) => r.rating === 1).length || 0,
      },
    };

    return successResponse({
      reviews: reviews || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
      statistics,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch reviews");
  }
}
