import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { USER_VERIFICATION_QUEUE_STATUSES } from "@/lib/admin/verification-queue-statuses";

/**
 * GET /api/admin/verifications
 * Get all pending verifications (for admin review)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending"; // Filter by status

    if (!supabase) {
      return successResponse([]);
    }

    // Fetch verifications
    let query = supabase
      .from("user_verifications")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false });

    if (status === "pending") {
      query = query.in("status", [...USER_VERIFICATION_QUEUE_STATUSES]);
    } else if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: verifications, error } = await query;

    if (error) {
      console.error("Error fetching verifications:", error);
      return successResponse([]);
    }

    if (!verifications || verifications.length === 0) {
      return successResponse([]);
    }

    // Fetch related user data separately
    type VerificationRow = { user_id?: string; reviewed_by?: string };
    const vList = verifications as VerificationRow[];
    const userIds = [...new Set(vList.map((v) => v.user_id).filter(Boolean))];
    const reviewerIds = [...new Set(vList.map((v) => v.reviewed_by).filter(Boolean))];

    const { data: users } = userIds.length > 0
      ? await supabase
          .from("users")
          .select("id, full_name, email, phone, avatar_url")
          .in("id", userIds)
      : { data: [] };

    const { data: reviewers } = reviewerIds.length > 0
      ? await supabase
          .from("users")
          .select("id, full_name, email")
          .in("id", reviewerIds)
      : { data: [] };

    const admin = getSupabaseAdmin();
    const [ownerProvidersRes, staffProvidersRes] = await Promise.all([
      userIds.length > 0
        ? admin
            .from("providers")
            .select("id, user_id, business_name, slug, verification_status")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? admin
            .from("provider_staff")
            .select("user_id, providers:providers!provider_staff_provider_id_fkey(id, business_name, slug, verification_status)")
            .in("user_id", userIds)
            .eq("is_active", true)
        : Promise.resolve({ data: [] }),
    ]);

    type UserRow = { id: string; full_name?: string; email?: string; phone?: string | null; avatar_url?: string | null };
    type ProviderInfo = { id: string; business_name?: string | null; slug?: string | null; verification_status?: string | null; relationship: "owner" | "staff" };
    const userMap = new Map((users || []).map((u: UserRow) => [u.id, u]));
    const reviewerMap = new Map((reviewers || []).map((r: UserRow) => [r.id, r]));
    const providerMap = new Map<string, ProviderInfo>();
    for (const p of (ownerProvidersRes.data || []) as Array<{ id: string; user_id?: string; business_name?: string | null; slug?: string | null; verification_status?: string | null }>) {
      if (!p.user_id) continue;
      providerMap.set(p.user_id, {
        id: p.id,
        business_name: p.business_name,
        slug: p.slug,
        verification_status: p.verification_status,
        relationship: "owner",
      });
    }
    for (const row of (staffProvidersRes.data || []) as Array<{ user_id?: string; providers?: ProviderInfo | ProviderInfo[] | null }>) {
      if (!row.user_id || providerMap.has(row.user_id)) continue;
      const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      if (!provider?.id) continue;
      providerMap.set(row.user_id, {
        id: provider.id,
        business_name: provider.business_name,
        slug: provider.slug,
        verification_status: provider.verification_status,
        relationship: "staff",
      });
    }

    const enrichedVerifications = vList.map((v) => ({
      ...v,
      user: userMap.get(v.user_id ?? "") ?? {
        id: v.user_id,
        full_name: "Unknown User",
        email: "N/A",
        phone: null,
      },
      reviewer: v.reviewed_by ? reviewerMap.get(v.reviewed_by) ?? null : null,
      provider: providerMap.get(v.user_id ?? "") ?? null,
    }));

    return successResponse(enrichedVerifications);
  } catch (error) {
    return handleApiError(error, "Failed to fetch verifications");
  }
}
