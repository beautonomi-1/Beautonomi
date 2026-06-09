/**
 * PATCH /api/provider/ads/campaigns/[id] - Update campaign (status, budget, daily_budget, targeting, bid_cpc)
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function getProviderId(userId: string, request: NextRequest): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  return getProviderIdForUser(userId, supabase as never, { request });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderId(user.id, request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);
    const { id: campaignId } = await params;

    const body = await request.json();
    const updates: Record<string, any> = {};
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
      .select("id, provider_id, pack_impressions, budget, spent, billing_model, start_at, end_at, funded_at")
      .eq("id", campaignId)
      .single();
    if (!existing || existing.provider_id !== providerId) {
      return errorResponse("Campaign not found", "NOT_FOUND", 404);
    }
    const billingModel = (existing as any).billing_model ?? "cpc_budget";
    const isPackCampaign = (existing as any).pack_impressions != null;
    const isTimeBased = billingModel === "time_based";

    if (updates.status === "active") {
      const budget = Number((existing as any).budget ?? 0);
      const spent = Number((existing as any).spent ?? 0);
      // Serve-time funding guard (migration 664): only a verified, non-reversed
      // payment (funded_at) may (re)activate a campaign. A provider cannot flip an
      // unfunded/reversed campaign back to active by hand.
      if (!(existing as any).funded_at) {
        return errorResponse(
          "This campaign needs a paid budget before it can be activated.",
          "ADS_PAYMENT_REQUIRED",
          400
        );
      }
      if (budget <= 0 || (!isTimeBased && budget - spent <= 0)) {
        return errorResponse(
          "This campaign needs a paid budget before it can be activated.",
          "ADS_PAYMENT_REQUIRED",
          400
        );
      }
      if (isTimeBased && (!(existing as any).start_at || !(existing as any).end_at)) {
        return errorResponse(
          "This time-based campaign is waiting for payment activation.",
          "ADS_PAYMENT_REQUIRED",
          400
        );
      }
    }

    if (isTimeBased) {
      // Time-based campaigns: only status and targeting can be edited
      if (body.budget !== undefined || body.daily_budget !== undefined || body.bid_cpc !== undefined) {
        return errorResponse(
          "Time-based campaigns cannot have their budget or bid modified. Purchase a new boost to extend.",
          "TIME_BASED_READONLY",
          400
        );
      }
      if (body.start_at !== undefined || body.end_at !== undefined) {
        return errorResponse(
          "Time-based campaign dates are set automatically and cannot be changed.",
          "TIME_BASED_READONLY",
          400
        );
      }
    } else if (!isPackCampaign) {
      if (body.budget !== undefined) {
        const newBudget = Math.max(0, Number(body.budget));
        if (newBudget > Number(existing.budget ?? 0)) {
          return errorResponse(
            "Budget increases require a new payment. Use the top-up flow to add funds.",
            "BUDGET_INCREASE_REQUIRES_PAYMENT",
            400
          );
        }
        updates.budget = newBudget;
      }
      if (body.daily_budget !== undefined) updates.daily_budget = body.daily_budget == null ? null : Math.max(0, Number(body.daily_budget));
      if (body.bid_cpc !== undefined) updates.bid_cpc = Math.max(0, Number(body.bid_cpc));
    }
    if (!isTimeBased) {
      if (body.start_at !== undefined) updates.start_at = body.start_at;
      if (body.end_at !== undefined) updates.end_at = body.end_at;
    }
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
