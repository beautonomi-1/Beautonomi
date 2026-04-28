import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/reviews
 * 
 * Fetch all reviews with filtering and pagination. Uses admin client to bypass RLS.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    // Pre-load provider IDs scoped to this tenant so reviews are tenant-scoped
    const { data: tenantProviders } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId);
    const tenantProviderIds = (tenantProviders ?? []).map((p: { id: string }) => p.id);

    const status = searchParams.get("status"); // all, visible, hidden, flagged
    const rating = searchParams.get("rating"); // 1-5
    const providerId = searchParams.get("provider_id");
    const customerId = searchParams.get("customer_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const search = searchParams.get("search")?.trim() ?? "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let searchOrFilter: string | null = null;
    if (search) {
      const safeIlike = search.replace(/[%_]/g, "");

      const { data: matchingBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("booking_number", `%${search}%`)
        .limit(300);

      const { data: matchingCustomers } = await supabase
        .from("users")
        .select("id")
        .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(300);

      const { data: matchingSearchProviders } = await supabase
        .from("providers")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("business_name", `%${search}%`)
        .limit(300);

      const bookingIds = (matchingBookings ?? []).map((b: { id: string }) => b.id);
      const customerIds = (matchingCustomers ?? []).map((u: { id: string }) => u.id);
      const nameMatchedProviderIds = (matchingSearchProviders ?? []).map((p: { id: string }) => p.id);

      const orParts: string[] = [];
      if (safeIlike) {
        orParts.push(`comment.ilike.%${safeIlike}%`);
      }
      if (bookingIds.length) orParts.push(`booking_id.in.(${bookingIds.join(",")})`);
      if (customerIds.length) orParts.push(`customer_id.in.(${customerIds.join(",")})`);
      if (nameMatchedProviderIds.length) {
        orParts.push(`provider_id.in.(${nameMatchedProviderIds.join(",")})`);
      }
      // No clause would match (e.g. only wildcards) — return no rows
      if (orParts.length === 0) {
        searchOrFilter = "id.eq.00000000-0000-0000-0000-000000000000";
      } else {
        searchOrFilter = orParts.join(",");
      }
    }

    let query = supabase
      .from("reviews")
      .select(`
        id,
        booking_id,
        customer_id,
        provider_id,
        rating,
        customer_rating,
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
        provider:providers!reviews_provider_id_fkey(id, business_name, thumbnail_url, avatar_url),
        booking:bookings(id, booking_number, status)
      `)
      .in("provider_id", tenantProviderIds.length > 0 ? tenantProviderIds : ["__none__"])
      .order("created_at", { ascending: false });

    if (searchOrFilter) {
      query = query.or(searchOrFilter);
    }

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

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: reviews, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .in("provider_id", tenantProviderIds.length > 0 ? tenantProviderIds : ["__none__"]);

    if (searchOrFilter) {
      countQuery = countQuery.or(searchOrFilter);
    }

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

    if (startDate) {
      countQuery = countQuery.gte("created_at", startDate);
    }
    if (endDate) {
      countQuery = countQuery.lte("created_at", endDate);
    }

    const { count } = await countQuery;

    // Get statistics (tenant-scoped)
    const { data: stats } = await supabase
      .from("reviews")
      .select("rating, is_visible, is_flagged")
      .in("provider_id", tenantProviderIds.length > 0 ? tenantProviderIds : ["__none__"]);

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
