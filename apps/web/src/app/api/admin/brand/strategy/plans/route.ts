import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const bodySchema = z.object({
  pillar_id: z.string().uuid(),
  year: z.coerce.number().int(),
  quarter: z.coerce.number().int().min(1).max(4),
  budget: z.coerce.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data: pillar } = await supabase
      .from("brand_pillars")
      .select("id")
      .eq("id", body.pillar_id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!pillar) return errorResponse("Pillar not found", "NOT_FOUND", 404);

    const { data, error } = await supabase
      .from("brand_plans")
      .insert({
        tenant_id: access.tenantId,
        pillar_id: body.pillar_id,
        year: body.year,
        quarter: body.quarter,
        budget: body.budget ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;

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
