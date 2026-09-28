import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { assertStrategyEditable, getStrategyById } from "@/lib/brand-marketing/strategy";

const bodySchema = z.object({
  strategy_id: z.string().uuid(),
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const strategy = await getStrategyById(supabase, access.tenantId, body.strategy_id);
    if (!strategy) return errorResponse("Strategy not found", "NOT_FOUND", 404);
    const lock = assertStrategyEditable(strategy);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    for (let i = 0; i < body.ordered_ids.length; i++) {
      await supabase
        .from("brand_pillars")
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq("id", body.ordered_ids[i])
        .eq("strategy_id", body.strategy_id)
        .eq("tenant_id", access.tenantId);
    }
    return successResponse({ ok: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to reorder pillars");
  }
}
