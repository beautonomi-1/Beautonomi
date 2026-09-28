import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { assertStrategyEditable, createPlanSchema, getStrategyById } from "@/lib/brand-marketing/strategy";

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createPlanSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data: pillar } = await supabase
      .from("brand_pillars")
      .select("id, strategy_id")
      .eq("id", body.pillar_id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!pillar) return errorResponse("Pillar not found", "NOT_FOUND", 404);

    const strategy = await getStrategyById(supabase, access.tenantId, pillar.strategy_id);
    if (!strategy) return errorResponse("Strategy not found", "NOT_FOUND", 404);
    const lock = assertStrategyEditable(strategy);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);
    if (body.year !== strategy.year) {
      return errorResponse("Plan year must match strategy year", "VALIDATION_ERROR", 400);
    }

    const { data, error } = await supabase
      .from("brand_plans")
      .insert({
        tenant_id: access.tenantId,
        pillar_id: body.pillar_id,
        year: body.year,
        quarter: body.quarter,
        budget: body.budget ?? 0,
        objective: body.objective ?? null,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return errorResponse("Quarter plan already exists", "DUPLICATE", 409);
      throw error;
    }

    await auditBrandMutation(request, supabase, access, {
      action: "brand.plan_created",
      entityType: "brand_plan",
      entityId: data.id,
      risk: "low",
      retention: "operational",
      after: data as Record<string, unknown>,
    });

    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create plan");
  }
}
