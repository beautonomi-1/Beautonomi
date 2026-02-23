/**
 * PATCH /api/provider/ads/campaigns/[id] - Update campaign (status, budget, daily_budget, targeting, bid_cpc)
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function getProviderId(request: NextRequest): Promise<string | null> {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = getSupabaseAdmin();
  const { data: byOwner } = await supabase.from("providers").select("id").eq("user_id", user.id).limit(1).maybeSingle();
  if (byOwner) return byOwner.id;
  const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
  return staff?.provider_id ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const providerId = await getProviderId(request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);
    const { id: campaignId } = await params;

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["draft", "active", "paused", "ended"].includes(status)) {
        return errorResponse("Invalid status", "VALIDATION", 400);
      }
      updates.status = status;
    }
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("ads_campaigns")
      .select("id, provider_id, pack_impressions")
      .eq("id", campaignId)
      .single();
    if (!existing || existing.provider_id !== providerId) {
      return errorResponse("Campaign not found", "NOT_FOUND", 404);
    }
    const isPackCampaign = (existing as any).pack_impressions != null;
    if (!isPackCampaign) {
      if (body.budget !== undefined) updates.budget = Math.max(0, Number(body.budget));
      if (body.daily_budget !== undefined) updates.daily_budget = body.daily_budget == null ? null : Math.max(0, Number(body.daily_budget));
      if (body.bid_cpc !== undefined) updates.bid_cpc = Math.max(0, Number(body.bid_cpc));
    }
    if (body.start_at !== undefined) updates.start_at = body.start_at;
    if (body.end_at !== undefined) updates.end_at = body.end_at;
    if (body.targeting !== undefined) updates.targeting = body.targeting;
    if (body.bid_settings !== undefined) updates.bid_settings = body.bid_settings;

    const { data, error } = await supabase
      .from("ads_campaigns")
      .update(updates)
      .eq("id", campaignId)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to update campaign");
  }
}
