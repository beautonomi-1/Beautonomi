import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { loadBrandSettings } from "@/lib/brand-marketing/settings";
import { findOwnedChannelClashes } from "@/lib/brand-marketing/clashes";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const settings = await loadBrandSettings(supabase, access.tenantId);
    const staleBefore = new Date(Date.now() - settings.stale_metric_days * 86400000).toISOString();

    const { data: briefsReview } = await supabase
      .from("brand_briefs")
      .select("id, name, status, updated_at")
      .eq("tenant_id", access.tenantId)
      .in("status", ["submitted", "in_review"]);

    const { data: liveCampaigns } = await supabase
      .from("brand_campaigns")
      .select("id, name, stage, budget_envelope, tracking_code")
      .eq("tenant_id", access.tenantId)
      .in("stage", ["live", "measuring"]);

    const { data: stalePlacements } = await supabase
      .from("brand_placements")
      .select("id, name, channel_key, campaign_id, last_metric_at")
      .eq("tenant_id", access.tenantId)
      .or(`last_metric_at.is.null,last_metric_at.lt.${staleBefore}`);

    const owned_clashes = await findOwnedChannelClashes(supabase, access.tenantId);

    const { data: pendingApprovals } = await supabase
      .from("brand_approvals")
      .select("id, subject_type, subject_id, status, due_at")
      .eq("tenant_id", access.tenantId)
      .eq("approver_id", access.user.id)
      .eq("status", "pending");

    const { data: openTasks } = await supabase
      .from("brand_tasks")
      .select("id, title, due_at, campaign_id")
      .eq("tenant_id", access.tenantId)
      .eq("owner_id", access.user.id)
      .eq("status", "open");

    return successResponse({
      briefs_in_review: briefsReview ?? [],
      live_campaigns: liveCampaigns ?? [],
      stale_placements: stalePlacements ?? [],
      owned_channel_clashes: owned_clashes,
      pending_approvals: pendingApprovals ?? [],
      open_tasks: openTasks ?? [],
      stale_metric_days: settings.stale_metric_days,
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load brand my-work");
  }
}
