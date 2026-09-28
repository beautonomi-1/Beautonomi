import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { createStrategySchema, loadStrategyTree } from "@/lib/brand-marketing/strategy";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const includeArchived = new URL(request.url).searchParams.get("include_archived") === "1";
    const supabase = getSupabaseAdmin();
    const items = await loadStrategyTree(supabase, access.tenantId, { includeArchived });
    return successResponse({ items });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load strategy");
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createStrategySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_strategies")
      .insert({
        tenant_id: access.tenantId,
        year: body.year,
        positioning: body.positioning ?? null,
        brand_promise: body.brand_promise ?? null,
        audience_priorities: body.audience_priorities ?? {},
        notes: body.notes ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return errorResponse("Strategy year already exists", "YEAR_EXISTS", 409);
      throw error;
    }
    await auditBrandMutation(request, supabase, access, {
      action: "brand.strategy_created",
      entityType: "brand_strategy",
      entityId: data.id,
      risk: "medium",
      retention: "operational",
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create strategy");
  }
}
