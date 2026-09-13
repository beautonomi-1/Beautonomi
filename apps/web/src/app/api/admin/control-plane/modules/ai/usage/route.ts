import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/control-plane/modules/ai/usage
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;
    const featureKey = searchParams.get("feature_key") ?? undefined;
    const providerId = searchParams.get("provider_id") ?? undefined;
    const fromDate = searchParams.get("from") ?? undefined;
    const toDate = searchParams.get("to") ?? undefined;

    const supabase = getSupabaseAdmin();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (q: any) => {
      let filtered = q;
      if (featureKey) filtered = filtered.eq("feature_key", featureKey);
      if (providerId) filtered = filtered.eq("provider_id", providerId);
      if (fromDate) filtered = filtered.gte("created_at", fromDate);
      if (toDate) filtered = filtered.lte("created_at", toDate);
      return filtered;
    };

    let q = applyFilters(
      supabase
        .from("ai_usage_log")
        .select(
          "id, actor_user_id, provider_id, tenant_id, feature_key, model, model_provider, runtime, gateway, tokens_in, tokens_out, cost_estimate, latency_ms, fallback_used, breaker_tripped, success, error_code, created_at",
          { count: "exact" },
        ),
    )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw error;

    const { data: summaryRows } = await applyFilters(
      supabase.from("ai_usage_log").select("tokens_in, tokens_out, cost_estimate"),
    );

    const total = count ?? 0;
    const tokensIn = (summaryRows ?? []).reduce((s, r) => s + (r.tokens_in ?? 0), 0);
    const tokensOut = (summaryRows ?? []).reduce((s, r) => s + (r.tokens_out ?? 0), 0);
    const costEst = (summaryRows ?? []).reduce((s, r) => s + Number(r.cost_estimate ?? 0), 0);

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
