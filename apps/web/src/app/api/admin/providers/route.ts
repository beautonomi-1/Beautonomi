import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/providers
 * Get list of all providers (superadmin only). Uses admin client to bypass RLS.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const searchTerm = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("providers")
      .select(`
        id,
        business_name,
        slug,
        business_type,
        status,
        is_verified,
        billing_email,
        billing_phone,
        user_id,
        rating_average,
        review_count,
        created_at,
        max_service_distance_km,
        is_distance_filter_enabled,
        provider_locations (city, country)
      `, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("business_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "pending") {
        query = query.in("status", ["draft", "pending_approval"]);
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    if (searchTerm) {
      const safe = searchTerm.replace(/[%_]/g, "");
      query = query.or(`business_name.ilike.%${safe}%,slug.ilike.%${safe}%`);
    }
    // limit is already applied via .range() above; no additional .limit() needed.

    const { data: providers, error, count } = await query;

    if (error) {
      throw error;
    }

    type ProviderRow = {
      user_id?: string;
      id: string;
      business_name?: string;
      slug?: string;
      business_type?: string;
      status?: string;
      is_verified?: boolean;
      billing_email?: string;
      billing_phone?: string;
      provider_locations?: unknown[];
      created_at?: string;
      rating_average?: number;
      review_count?: number;
      max_service_distance_km?: number | null;
      is_distance_filter_enabled?: boolean | null;
    };
    type UserRow = { id: string; full_name?: string; email?: string; phone?: string };
    const userIds = [...new Set((providers || []).map((p: ProviderRow) => p.user_id).filter(Boolean))] as string[];
    const usersMap = new Map<string, UserRow>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      for (const u of (users || []) as UserRow[]) {
        usersMap.set(u.id, u);
      }
    }

    const transformed = (providers || []).map((p: ProviderRow) => {
      const locations = (p.provider_locations || []) as { city?: string; country?: string }[];
      const firstLoc = locations[0];
      const status = p.status === "pending_approval" || p.status === "draft" ? "pending" : p.status;
      const owner = usersMap.get(p.user_id);

      return {
        id: p.id,
        business_name: p.business_name,
        name: p.business_name,
        slug: p.slug,
        business_type: p.business_type,
        status,
        verification_status: p.is_verified ? "verified" : "unverified",
        owner_name: owner?.full_name || "—",
        owner_email: p.billing_email || owner?.email || "—",
        owner_phone: p.billing_phone || owner?.phone,
        city: firstLoc?.city || "—",
        country: firstLoc?.country || "—",
        created_at: p.created_at,
        rating: p.rating_average ?? 0,
        review_count: p.review_count ?? 0,
        max_service_distance_km: p.max_service_distance_km ?? null,
        is_distance_filter_enabled: p.is_distance_filter_enabled ?? null,
      };
    });

    return successResponse({
      data: transformed,
      meta: { page, limit, total: count ?? transformed.length, has_more: offset + transformed.length < (count ?? transformed.length) },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch providers");
  }
}
