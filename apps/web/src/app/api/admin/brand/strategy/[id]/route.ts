import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import {
  assertStrategyEditable,
  canHardDelete,
  countStrategyLinks,
  getStrategyById,
  patchStrategySchema,
  rollupStrategyBudgets,
} from "@/lib/brand-marketing/strategy";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const supabase = getSupabaseAdmin();
    const strategy = await getStrategyById(supabase, access.tenantId, id);
    if (!strategy) return errorResponse("Not found", "NOT_FOUND", 404);

    const links = await countStrategyLinks(supabase, access.tenantId, "strategy", id);
    const budget_rollup = await rollupStrategyBudgets(supabase, access.tenantId, id);
    return successResponse({ strategy, links, budget_rollup });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load strategy");
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const body = patchStrategySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const before = await getStrategyById(supabase, access.tenantId, id);
    if (!before) return errorResponse("Not found", "NOT_FOUND", 404);
    const lock = assertStrategyEditable(before);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    const { data, error } = await supabase
      .from("brand_strategies")
      .update({
        positioning: body.positioning,
        brand_promise: body.brand_promise,
        audience_priorities: body.audience_priorities,
        notes: body.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: "brand.strategy_updated",
      entityType: "brand_strategy",
      entityId: id,
      risk: "medium",
      retention: "operational",
      before: before as Record<string, unknown>,
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update strategy");
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const supabase = getSupabaseAdmin();
    const guard = await canHardDelete(supabase, access.tenantId, "strategy", id);
    if (guard.ok === false) {
      return errorResponse(guard.reason, "VALIDATION_ERROR", 400, { counts: guard.counts });
    }
    const { error } = await supabase.from("brand_strategies").delete().eq("id", id).eq("tenant_id", access.tenantId);
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.strategy_deleted",
      entityType: "brand_strategy",
      entityId: id,
      risk: "high",
      retention: "permanent",
    });
    return successResponse({ deleted: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to delete strategy");
  }
}
