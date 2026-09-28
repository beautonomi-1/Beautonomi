import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { approveGoLiveRequest } from "@/lib/brand-marketing/stage";
import { decideBrandApproval } from "@/lib/brand-marketing/approvals";
import { extractRequestMeta } from "@/lib/audit/audit";
import { auditBrand } from "@/lib/brand-marketing/audit";

const bodySchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  comment: z.string().optional(),
});

export async function POST(
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
    const meta = extractRequestMeta(request);

    const { data: approval } = await supabase
      .from("brand_approvals")
      .select("subject_type, subject_id, status")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();

    if (!approval) return errorResponse("Not found", "NOT_FOUND", 404);

    if (approval.subject_type === "go_live" && body.decision === "approved") {
      const result = await approveGoLiveRequest(
        supabase,
        access.tenantId,
        id,
        access.user.id,
        String(access.user.role ?? ""),
        body.comment,
      );
      if (result.ok === false) return errorResponse(result.message, result.code, 400);
      await auditBrand(request, {
        supabase,
        tenantId: access.tenantId,
        actorId: access.user.id,
        actorRole: access.user.role,
        action: "brand.approval.go_live",
        entityType: "brand_campaign",
        entityId: approval.subject_id,
        risk: "high",
        retention: "permanent",
        campaignId: approval.subject_id,
        meta: { approval_id: id, ...meta },
      });
      return successResponse(result);
    }

    const decided = await decideBrandApproval(supabase, {
      tenantId: access.tenantId,
      approvalId: id,
      actorId: access.user.id,
      decision: body.decision,
      comment: body.comment,
      evidence: meta,
    });
    if (decided.ok === false) return errorResponse(decided.message, "VALIDATION_ERROR", 400);

    await auditBrand(request, {
      supabase,
      tenantId: access.tenantId,
      actorId: access.user.id,
      actorRole: access.user.role,
      action: `brand.approval.${body.decision}`,
      entityType: approval.subject_type,
      entityId: approval.subject_id,
      risk: "medium",
      retention: "operational",
      campaignId: approval.subject_type === "go_live" ? approval.subject_id : null,
      meta: { approval_id: id, ...meta },
      reason: body.comment ?? null,
    });

    return successResponse({ ok: true });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to decide approval");
  }
}
