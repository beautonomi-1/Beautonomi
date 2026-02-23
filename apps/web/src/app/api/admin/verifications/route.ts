import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/verifications
 * Get all pending verifications (for admin review)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending"; // Filter by status

    if (!supabase) {
      return successResponse([]);
    }

    // Fetch verifications
    let query = supabase
      .from("user_verifications")
      .select("*")
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
    const userIds = [...new Set(verifications.map((v: any) => v.user_id).filter(Boolean))];
    const reviewerIds = [
      ...new Set(verifications.map((v: any) => v.reviewed_by).filter(Boolean)),
    ];

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

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));
    const reviewerMap = new Map((reviewers || []).map((r: any) => [r.id, r]));

    // Combine data
    const enrichedVerifications = verifications.map((v: any) => ({
      ...v,
      user: userMap.get(v.user_id) || {
        id: v.user_id,
        full_name: "Unknown User",
        email: "N/A",
        phone: null,
      },
      reviewer: v.reviewed_by ? reviewerMap.get(v.reviewed_by) || null : null,
    }));

    return successResponse(enrichedVerifications);
  } catch (error) {
    return handleApiError(error, "Failed to fetch verifications");
  }
}
