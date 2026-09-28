import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_strategies")
      .select("*, brand_pillars(*, brand_plans(*))")
      .eq("tenant_id", access.tenantId)
      .order("year", { ascending: false });
    if (error) throw error;
    return successResponse({ items: data ?? [] });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load strategy");
  }
}

const createSchema = z.object({
  year: z.coerce.number().int(),
  positioning: z.string().optional(),
  brand_promise: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_strategies")
      .insert({
        tenant_id: access.tenantId,
        year: body.year,
        positioning: body.positioning,
        brand_promise: body.brand_promise,
      })
      .select("*")
      .single();
    if (error) throw error;
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
