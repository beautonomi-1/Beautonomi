import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const bodySchema = z.object({
  strategy_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data: strategy } = await supabase
      .from("brand_strategies")
      .select("id")
      .eq("id", body.strategy_id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!strategy) return errorResponse("Strategy not found", "NOT_FOUND", 404);

    const { data, error } = await supabase
      .from("brand_pillars")
      .insert({
        tenant_id: access.tenantId,
        strategy_id: body.strategy_id,
        name: body.name,
        description: body.description ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;

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
