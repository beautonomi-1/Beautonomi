import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

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

    if (status !== "all") {
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

    type UserRow = { id: string; full_name?: string; email?: string; phone?: string | null; avatar_url?: string | null };
    const userMap = new Map((users || []).map((u: UserRow) => [u.id, u]));
    const reviewerMap = new Map((reviewers || []).map((r: UserRow) => [r.id, r]));

    const enrichedVerifications = vList.map((v) => ({
      ...v,
      user: userMap.get(v.user_id ?? "") ?? {
        id: v.user_id,
        full_name: "Unknown User",
        email: "N/A",
        phone: null,
      },
      reviewer: v.reviewed_by ? reviewerMap.get(v.reviewed_by) ?? null : null,
    }));

    return successResponse(enrichedVerifications);
  } catch (error) {
    return handleApiError(error, "Failed to fetch verifications");
  }
}
