import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { acceptBrandBrief } from "@/lib/brand-marketing/accept-brief";
import { loadTenantSlug } from "@/lib/brand-marketing/tenant";
import { notifyAdminOps } from "@/lib/notifications/notify-admin-ops";
import { notifyBrandBriefAccepted } from "@/lib/brand-marketing/notify";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";

const bodySchema = z.object({
  action: z.enum(["submit", "start_review", "request_changes", "accept", "reject", "park"]),
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

    const { action, comment } = bodySchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    if (action === "accept") {
      const slug = await loadTenantSlug(supabase, access.tenantId);
      const result = await acceptBrandBrief(supabase, {
        tenantId: access.tenantId,
        briefId: id,
        actorId: access.user.id,
        tenantSlug: slug,
      });
      const { data: brief } = await supabase.from("brand_briefs").select("name").eq("id", id).single();
      await notifyBrandBriefAccepted({
        tenantId: access.tenantId,
        briefName: brief?.name ?? "Campaign",
        campaignId: result.campaignId,
      });
      await auditBrandMutation(request, supabase, access, {
        action: "brand.brief_accepted",
        entityType: "brand_brief",
        entityId: id,
        risk: "high",
        retention: "permanent",
        briefId: id,
        campaignId: result.campaignId,
        reason: comment ?? null,
      });
      return successResponse(result);
    }

    const statusMap = {
      submit: "submitted",
      start_review: "in_review",
      request_changes: "changes_requested",
      reject: "rejected",
      park: "parked",
    } as const;

    const nextStatus = statusMap[action as keyof typeof statusMap];
    const { data, error } = await supabase
      .from("brand_briefs")
      .update({
        status: nextStatus,
        reviewer_id: action === "start_review" ? access.user.id : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    await auditBrandMutation(request, supabase, access, {
      action: `brand.brief_${action}`,
      entityType: "brand_brief",
      entityId: id,
      risk: action === "reject" ? "medium" : "low",
      retention: "operational",
      briefId: id,
      after: data as Record<string, unknown>,
      reason: comment ?? null,
    });

    if (comment?.trim()) {
      await supabase.from("brand_activity").insert({
        tenant_id: access.tenantId,
        brief_id: id,
        actor_id: access.user.id,
        kind: "review_comment",
        body: comment.trim(),
      });
    }

    if (action === "submit" || action === "request_changes") {
      await notifyAdminOps({
        roles: ["admin_marketing", "superadmin"],
        type: "admin_ops_alert",
        title: action === "submit" ? "Brand brief submitted" : "Brand brief needs changes",
        message: data.name,
        link: `/admin/brand/briefs/${id}`,
        tenantId: access.tenantId,
      });
    }

    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to review brand brief");
  }
}
