import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/control-plane/modules/ai/usage
 * List AI usage log with filters (superadmin only).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;
    const featureKey = searchParams.get("feature_key") ?? undefined;
    const providerId = searchParams.get("provider_id") ?? undefined;
    const fromDate = searchParams.get("from") ?? undefined;
    const toDate = searchParams.get("to") ?? undefined;

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("ai_usage_log")
      .select("id, actor_user_id, provider_id, feature_key, model, tokens_in, tokens_out, cost_estimate, success, error_code, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (featureKey) q = q.eq("feature_key", featureKey);
    if (providerId) q = q.eq("provider_id", providerId);
    if (fromDate) q = q.gte("created_at", fromDate);
    if (toDate) q = q.lte("created_at", toDate);

    const { data, error, count } = await q;

    if (error) throw error;

    const total = count ?? 0;
    const tokensIn = (data ?? []).reduce((s, r) => s + (r.tokens_in ?? 0), 0);
    const tokensOut = (data ?? []).reduce((s, r) => s + (r.tokens_out ?? 0), 0);
    const costEst = (data ?? []).reduce((s, r) => s + Number(r.cost_estimate ?? 0), 0);

    return successResponse({
      items: data ?? [],
      total,
      page,
      limit,
      has_more: total > offset + limit,
      summary: { tokens_in: tokensIn, tokens_out: tokensOut, cost_estimate: costEst },
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch usage");
  }
}
