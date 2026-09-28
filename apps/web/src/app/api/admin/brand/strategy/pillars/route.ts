import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { assertStrategyEditable, createPillarSchema, getStrategyById } from "@/lib/brand-marketing/strategy";

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createPillarSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const strategy = await getStrategyById(supabase, access.tenantId, body.strategy_id);
    if (!strategy) return errorResponse("Strategy not found", "NOT_FOUND", 404);
    const lock = assertStrategyEditable(strategy);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    const { data, error } = await supabase
      .from("brand_pillars")
      .insert({
        tenant_id: access.tenantId,
        strategy_id: body.strategy_id,
        name: body.name,
        description: body.description ?? null,
        kpi_key: body.kpi_key ?? null,
        kpi_target: body.kpi_target ?? null,
        budget_target: body.budget_target ?? null,
        sort_order: body.sort_order ?? 0,
        owner_id: body.owner_id ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return errorResponse("Pillar name already exists", "DUPLICATE", 409);
      throw error;
    }

    if (body.kpi_key && body.kpi_target != null) {
      await supabase.from("brand_strategy_kpis").insert({
        tenant_id: access.tenantId,
        strategy_id: body.strategy_id,
        pillar_id: data.id,
        kpi_key: body.kpi_key,
        target: body.kpi_target,
      });
    }

    await auditBrandMutation(request, supabase, access, {
      action: "brand.pillar_created",
      entityType: "brand_pillar",
      entityId: data.id,
      risk: "low",
      retention: "operational",
      after: data as Record<string, unknown>,
    });

    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create pillar");
  }
}
