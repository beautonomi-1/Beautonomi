import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { assertStrategyEditable, getStrategyById } from "@/lib/brand-marketing/strategy";
import { getKpiByKey } from "@/lib/brand-marketing/kpis";

const createSchema = z.object({
  strategy_id: z.string().uuid(),
  pillar_id: z.string().uuid().nullable().optional(),
  plan_id: z.string().uuid().nullable().optional(),
  kpi_key: z.string().min(1),
  target: z.coerce.number(),
  weight: z.coerce.number().int().min(1).max(10).optional(),
  baseline: z.coerce.number().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createSchema.parse(await request.json());
    if (!getKpiByKey(body.kpi_key)) return errorResponse("Unknown KPI key", "VALIDATION_ERROR", 400);

    const supabase = getSupabaseAdmin();
    const strategy = await getStrategyById(supabase, access.tenantId, body.strategy_id);
    if (!strategy) return errorResponse("Strategy not found", "NOT_FOUND", 404);
    const lock = assertStrategyEditable(strategy);
    if (lock.ok === false) return errorResponse(lock.message, lock.code, 400);

    const { data, error } = await supabase
      .from("brand_strategy_kpis")
      .insert({
        tenant_id: access.tenantId,
        strategy_id: body.strategy_id,
        pillar_id: body.pillar_id ?? null,
        plan_id: body.plan_id ?? null,
        kpi_key: body.kpi_key,
        target: body.target,
        weight: body.weight ?? 1,
        baseline: body.baseline ?? null,
        owner_id: body.owner_id ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return errorResponse("KPI target already exists", "DUPLICATE", 409);
      throw error;
    }

    await auditBrandMutation(request, supabase, access, {
      action: "brand.strategy_kpi_created",
      entityType: "brand_strategy_kpi",
      entityId: data.id,
      risk: "low",
      retention: "operational",
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create KPI target");
  }
}
