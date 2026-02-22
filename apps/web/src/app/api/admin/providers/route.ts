import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/providers
 * Get list of all providers (superadmin only)
 * Returns full provider data including status, is_verified, owner info, location
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

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
        provider_locations (city, country)
      `)
      .order("business_name", { ascending: true });

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "pending") {
        query = query.in("status", ["draft", "pending_approval"]);
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    const { data: providers, error } = await query;

    if (error) {
      throw error;
    }

    const userIds = [...new Set((providers || []).map((p: any) => p.user_id).filter(Boolean))];
    const usersMap = new Map<string, { full_name?: string; email?: string; phone?: string }>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      for (const u of users || []) {
        usersMap.set((u as any).id, u);
      }
    }

    const transformed = (providers || []).map((p: any) => {
      const locations = (p.provider_locations || []) as { city?: string; country?: string }[];
      const firstLoc = locations[0];
      const status = p.status === "pending_approval" || p.status === "draft" ? "pending" : p.status;
      const owner = usersMap.get(p.user_id);

      return {
        id: p.id,
        business_name: p.business_name,
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
      };
    });

    return successResponse(transformed);
  } catch (error) {
    return handleApiError(error, "Failed to fetch providers");
  }
}
