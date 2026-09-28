import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { assertStrategyEditable, getStrategyById } from "@/lib/brand-marketing/strategy";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  target: z.coerce.number().optional(),
  weight: z.coerce.number().int().min(1).max(10).optional(),
  baseline: z.coerce.number().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const { id } = await ctx.params;
    const body = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data: kpi } = await supabase
      .from("brand_strategy_kpis")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!kpi) return errorResponse("Not found", "NOT_FOUND", 404);

    if (body.archived === true) {
      await supabase.from("brand_strategy_kpis").update({ archived_at: new Date().toISOString() }).eq("id", id);
      return successResponse({ archived: true });
    }
    if (body.archived === false) {
      await supabase.from("brand_strategy_kpis").update({ archived_at: null }).eq("id", id);
      return successResponse({ archived: false });
    }

    const strategy = await getStrategyById(supabase, access.tenantId, kpi.strategy_id);
    const lock = assertStrategyEditable(strategy!);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    const { data, error } = await supabase
      .from("brand_strategy_kpis")
      .update({
        target: body.target,
        weight: body.weight,
        baseline: body.baseline,
        owner_id: body.owner_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: "brand.strategy_kpi_updated",
      entityType: "brand_strategy_kpi",
      entityId: id,
      risk: "medium",
      retention: "operational",
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update KPI target");
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
    await supabase.from("brand_strategy_kpis").update({ archived_at: new Date().toISOString() }).eq("id", id);
    return successResponse({ archived: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to delete KPI target");
  }
}
