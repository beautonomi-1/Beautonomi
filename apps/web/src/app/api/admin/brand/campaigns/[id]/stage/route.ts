import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { changeBrandCampaignStage } from "@/lib/brand-marketing/stage";
import { notifyBrandCampaignLive } from "@/lib/brand-marketing/notify";
import { auditBrand } from "@/lib/brand-marketing/audit";

const bodySchema = z.object({
  stage: z.enum(["planning", "creative", "live", "measuring", "closed"]),
  expected_updated_at: z.string().optional(),
  closeout: z
    .object({
      worked: z.string().optional(),
      did_not: z.string().optional(),
      run_again: z.string().optional(),
    })
    .optional(),
  second_approver_id: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const result = await changeBrandCampaignStage(supabase, access.tenantId, id, {
      stage: body.stage,
      expected_updated_at: body.expected_updated_at,
      closeout: body.closeout,
      second_approver_id: body.second_approver_id,
      reason: body.reason,
      actorId: access.user.id,
      actorRole: String(access.user.role ?? ""),
    });

    if ("code" in result) {
      const code = result.code === "CONCURRENT_UPDATE" ? 409 : result.code === "NOT_FOUND" ? 404 : 400;
      return errorResponse(result.message, result.code, code, {
        blockers: "blockers" in result ? result.blockers : undefined,
      });
    }

    if (result.pending_go_live) {
      await auditBrand(request, {
        supabase,
        tenantId: access.tenantId,
        actorId: access.user.id,
        actorRole: access.user.role,
        action: "brand.go_live_requested",
        entityType: "brand_campaign",
        entityId: id,
        risk: "high",
        retention: "operational",
        campaignId: id,
        meta: { approval_id: result.approval_id },
      });
      return successResponse(result);
    }

    await auditBrand(request, {
      supabase,
      tenantId: access.tenantId,
      actorId: access.user.id,
      actorRole: access.user.role,
      action: "brand.stage_change",
      entityType: "brand_campaign",
      entityId: id,
      risk: body.reason ? "medium" : "low",
      retention: body.stage === "live" || body.stage === "closed" ? "permanent" : "operational",
      reason: body.reason ?? null,
      campaignId: id,
      body: `Stage → ${body.stage}`,
      meta: { previous_stage: result.previous_stage },
    });

    if (body.stage === "live") {
      const { data: camp } = await supabase.from("brand_campaigns").select("name").eq("id", id).single();
      await notifyBrandCampaignLive({
        tenantId: access.tenantId,
        campaignId: id,
        campaignName: camp?.name ?? "Campaign",
      });
    }

    return successResponse(result);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to change campaign stage");
  }
}
