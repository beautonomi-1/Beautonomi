import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/provider-client-ratings
 *
 * Provider→customer stars live in `provider_client_ratings` (per booking), separate from
 * `reviews.customer_rating` (written review flow). Admin Reviews UI lists both.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25));
    const offset = (page - 1) * limit;

    const { data: tenantProviders } = await supabase.from("providers").select("id").eq("tenant_id", tenantId);
    const tenantProviderIds = (tenantProviders ?? []).map((p: { id: string }) => p.id);

    if (tenantProviderIds.length === 0) {
      return successResponse({
        ratings: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }

    const { data: ratings, error, count } = await supabase
      .from("provider_client_ratings")
      .select(
        `
        id,
        booking_id,
        rating,
        comment,
        is_visible,
        created_at,
        customer:users(id, full_name, email, avatar_url),
        provider:providers(id, business_name, thumbnail_url, avatar_url),
        booking:bookings(id, booking_number, status)
      `,
        { count: "exact" },
      )
      .in("provider_id", tenantProviderIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const total = count ?? 0;
    return successResponse({
      ratings: ratings || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load provider→customer ratings");
  }
}
