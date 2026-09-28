import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const bodySchema = z.object({
  label: z.string().min(1),
  campaign_id: z.string().uuid().optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_evidence_packs")
      .insert({
        tenant_id: access.tenantId,
        label: body.label,
        campaign_id: body.campaign_id ?? null,
        period_start: body.period_start ?? null,
        period_end: body.period_end ?? null,
        status: "queued",
        requested_by: access.user.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    await auditBrandMutation(request, supabase, access, {
      action: "brand.evidence_pack_queued",
      entityType: "brand_evidence_pack",
      entityId: data.id,
      risk: "low",
      retention: "financial",
      campaignId: body.campaign_id ?? null,
      after: data as Record<string, unknown>,
    });
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to queue evidence pack");
  }
}
