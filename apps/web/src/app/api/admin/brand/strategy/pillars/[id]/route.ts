import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import {
  assertStrategyEditable,
  canHardDelete,
  getStrategyById,
  patchPillarSchema,
} from "@/lib/brand-marketing/strategy";

type Ctx = { params: Promise<{ id: string }> };

async function loadPillarStrategy(supabase: ReturnType<typeof getSupabaseAdmin>, tenantId: string, pillarId: string) {
  const { data: pillar } = await supabase
    .from("brand_pillars")
    .select("*")
    .eq("id", pillarId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!pillar) return null;
  const strategy = await getStrategyById(supabase, tenantId, pillar.strategy_id);
  return { pillar, strategy };
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const body = patchPillarSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const loaded = await loadPillarStrategy(supabase, access.tenantId, id);
    if (!loaded) return errorResponse("Not found", "NOT_FOUND", 404);

    if (body.archived === true) {
      await supabase
        .from("brand_pillars")
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
      return successResponse({ archived: true });
    }
    if (body.archived === false) {
      await supabase
        .from("brand_pillars")
        .update({ archived_at: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      return successResponse({ archived: false });
    }

    const lock = assertStrategyEditable(loaded.strategy!);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    const { data, error } = await supabase
      .from("brand_pillars")
      .update({
        name: body.name,
        description: body.description,
        kpi_key: body.kpi_key,
        kpi_target: body.kpi_target,
        budget_target: body.budget_target,
        sort_order: body.sort_order,
        owner_id: body.owner_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: "brand.pillar_updated",
      entityType: "brand_pillar",
      entityId: id,
      risk: "medium",
      retention: "operational",
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update pillar");
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
    const guard = await canHardDelete(supabase, access.tenantId, "pillar", id);
    if (guard.ok === false) return errorResponse(guard.reason, "VALIDATION_ERROR", 400);
    const { error } = await supabase.from("brand_pillars").delete().eq("id", id).eq("tenant_id", access.tenantId);
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.pillar_deleted",
      entityType: "brand_pillar",
      entityId: id,
      risk: "high",
      retention: "permanent",
    });
    return successResponse({ deleted: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to delete pillar");
  }
}
