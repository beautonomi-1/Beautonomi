import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import {
  assertStrategyEditable,
  canHardDelete,
  getStrategyById,
  patchPlanSchema,
} from "@/lib/brand-marketing/strategy";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const body = patchPlanSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data: plan } = await supabase.from("brand_plans").select("*").eq("id", id).eq("tenant_id", access.tenantId).maybeSingle();
    if (!plan) return errorResponse("Not found", "NOT_FOUND", 404);

    if (body.archived === true) {
      await supabase.from("brand_plans").update({ archived_at: new Date().toISOString() }).eq("id", id);
      return successResponse({ archived: true });
    }
    if (body.archived === false) {
      await supabase.from("brand_plans").update({ archived_at: null }).eq("id", id);
      return successResponse({ archived: false });
    }

    const { data: pillar } = await supabase.from("brand_pillars").select("strategy_id").eq("id", plan.pillar_id).single();
    const strategy = await getStrategyById(supabase, access.tenantId, pillar!.strategy_id);
    const lock = assertStrategyEditable(strategy!);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    const { data, error } = await supabase
      .from("brand_plans")
      .update({
        budget: body.budget,
        objective: body.objective,
        notes: body.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: "brand.plan_updated",
      entityType: "brand_plan",
      entityId: id,
      risk: "medium",
      retention: "operational",
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update plan");
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
    const guard = await canHardDelete(supabase, access.tenantId, "plan", id);
    if (guard.ok === false) return errorResponse(guard.reason, "VALIDATION_ERROR", 400);
    const { error } = await supabase.from("brand_plans").delete().eq("id", id).eq("tenant_id", access.tenantId);
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.plan_deleted",
      entityType: "brand_plan",
      entityId: id,
      risk: "high",
      retention: "permanent",
    });
    return successResponse({ deleted: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to delete plan");
  }
}
