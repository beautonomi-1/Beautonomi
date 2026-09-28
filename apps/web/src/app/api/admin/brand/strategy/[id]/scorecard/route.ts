import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { getStrategyById } from "@/lib/brand-marketing/strategy";
import type { StrategyTree } from "@/lib/brand-marketing/strategy-types";
import { buildStrategyScorecard } from "@/lib/brand-marketing/scorecard";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const asOfParam = new URL(request.url).searchParams.get("as_of");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();

    const supabase = getSupabaseAdmin();
    const loaded = await getStrategyById(supabase, access.tenantId, id);
    if (!loaded) return errorResponse("Not found", "NOT_FOUND", 404);
    const strategyTree: StrategyTree = loaded;

    const scorecard = await buildStrategyScorecard(supabase, access.tenantId, strategyTree, asOf);
    return successResponse(scorecard);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load scorecard");
  }
}
