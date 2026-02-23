import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/gamification/point-rules
 * List all point rules (superadmin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("provider_point_rules")
      .select("id, source, points, label, description, display_order, updated_at")
      .order("display_order", { ascending: true });

    if (error) throw error;
    return successResponse({ rules: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch point rules");
  }
}

/**
 * PATCH /api/admin/gamification/point-rules
 * Update one or more point rules. Body: { rules: { source: string, points: number }[] }
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { rules } = body as { rules: Array<{ source: string; points: number }> };
    if (!Array.isArray(rules) || rules.length === 0) {
      return errorResponse("rules array required", "VALIDATION_ERROR", 400);
    }
    for (const r of rules) {
      if (typeof r.source !== "string" || typeof r.points !== "number" || r.points < 0) {
        return errorResponse("Each rule must have source (string) and points (non-negative number)", "VALIDATION_ERROR", 400);
      }
    }
    const updated = [];
    for (const r of rules) {
      const { data, error } = await supabase
        .from("provider_point_rules")
        .update({ points: r.points, updated_at: new Date().toISOString() })
        .eq("source", r.source)
        .select()
        .single();
      if (error) throw error;
      if (data) updated.push(data);
    }
    return successResponse({ updated });
  } catch (error) {
    return handleApiError(error, "Failed to update point rules");
  }
}
