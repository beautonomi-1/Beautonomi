import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { autoBindPlacements, fetchMeasuredForCampaign } from "@/lib/brand-marketing/measured";
import { resolveUtcPeriod } from "@/lib/brand-marketing/periods";
import { loadBrandSettings } from "@/lib/brand-marketing/settings";
import { buildDemandFunnel, buildSupplyFunnel } from "@/lib/brand-marketing/funnel";
import { sumEnteredPlacementMetrics, sumKnownSpendForCampaign } from "@/lib/brand-marketing/placement-metrics";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
const patchSchema = z.object({
  name: z.string().optional(),
  objective: z.string().optional(),
  owner_id: z.string().uuid().optional(),
  budget_envelope: z.coerce.number().optional(),
  flight_start: z.string().optional(),
  flight_end: z.string().optional(),
  success_target: z.coerce.number().optional(),
  audience_definition: z.record(z.string(), z.unknown()).optional(),
  tracking_code: z.string().optional(),
  pillar_id: z.string().uuid().nullable().optional(),
  plan_id: z.string().uuid().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const url = new URL(request.url);
    const preset = (url.searchParams.get("period") ?? "this_month") as Parameters<
      typeof resolveUtcPeriod
    >[0];

    const supabase = getSupabaseAdmin();
    const { data: campaign, error } = await supabase
      .from("brand_campaigns")
      .select("*, brand_placements(*), brand_activity(*)")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!campaign) return errorResponse("Not found", "NOT_FOUND", 404);

    await autoBindPlacements(supabase, access.tenantId, id, campaign.tracking_code);

    const placements = campaign.brand_placements ?? [];
    const subCodes = placements.map((p: { tracking_code?: string }) => p.tracking_code).filter(Boolean) as string[];
    const period = resolveUtcPeriod(preset);
    const measured = await fetchMeasuredForCampaign(
      supabase,
      access.tenantId,
      campaign.tracking_code,
      subCodes,
      period,
      {
        promotionIds: placements.map((p: { promotion_id?: string }) => p.promotion_id).filter(Boolean) as string[],
        couponIds: placements.map((p: { coupon_id?: string }) => p.coupon_id).filter(Boolean) as string[],
        referralCodes: placements.map((p: { referral_code?: string }) => p.referral_code).filter(Boolean) as string[],
        referralProgram: placements.some((p: { referral_program?: boolean }) => p.referral_program),
        adsCampaignIds: placements.map((p: { ads_campaign_id?: string }) => p.ads_campaign_id).filter(Boolean) as string[],
        broadcastLogIds: placements.map((p: { broadcast_log_id?: string }) => p.broadcast_log_id).filter(Boolean) as string[],
        waitlistCity: placements.find((p: { waitlist_city?: string }) => p.waitlist_city)?.waitlist_city,
      },
    );

    const placementIds = placements.map((p: { id: string }) => p.id);
    const entered = await sumEnteredPlacementMetrics(supabase, placementIds, period);
    const spend = await sumKnownSpendForCampaign(supabase, access.tenantId, id, period);
    const settings = await loadBrandSettings(supabase, access.tenantId);

    const funnel =
      campaign.success_metric === "supply"
        ? buildSupplyFunnel({ measured })
        : buildDemandFunnel({
            trackingCode: campaign.tracking_code,
            measured,
            enteredReach: entered.reach,
            enteredClicks: entered.clicks,
          });

    const envelope = Number(campaign.budget_envelope ?? 0);
    const grossValue = measured.promo_booking_value + measured.attributed_booking_value;
    const successTarget = Number(campaign.success_target ?? 0);
    const actualOutcome =
      campaign.success_metric === "supply" ? measured.leads_won : measured.signups;

    const trackingKit = {
      utm_link: `https://beautonomi.com/?utm_source=brand&utm_medium=campaign&utm_campaign=${encodeURIComponent(campaign.tracking_code)}`,
      amplitude_filter: `brand_campaign_code = "${campaign.tracking_code}"`,
      provider_lead_source: campaign.tracking_code,
    };

    return successResponse({
      campaign,
      period,
      measured,
      spend,
      settings,
      tracking_kit: trackingKit,
      funnel,
      scorecard: {
        envelope,
        allocated: spend.allocated,
        known_spend: spend.known,
        remaining: envelope - spend.known,
        gross_booking_value: grossValue,
        roas: spend.known > 0 ? grossValue / spend.known : null,
        success_target: successTarget,
        actual_outcome: actualOutcome,
        pace_to_target:
          successTarget > 0 ? Math.round((actualOutcome / successTarget) * 1000) / 10 : null,
      },
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to fetch brand campaign");
  }
}

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

    const patch = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: before } = await supabase
      .from("brand_campaigns")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();

    if (patch.tracking_code) {
      const { data: clash } = await supabase
        .from("brand_campaigns")
        .select("id")
        .ilike("tracking_code", patch.tracking_code)
        .neq("id", id)
        .maybeSingle();
      if (clash) return errorResponse("Tracking code already used", "CODE_CLASH", 409);
    }

    const { data, error } = await supabase
      .from("brand_campaigns")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    if (patch.tracking_code) {
      await autoBindPlacements(supabase, access.tenantId, id, patch.tracking_code);
    }

    await auditBrandMutation(request, supabase, access, {
      action: "brand.campaign_updated",
      entityType: "brand_campaign",
      entityId: id,
      risk: patch.tracking_code ? "high" : "low",
      retention: "operational",
      campaignId: id,
      before: before as Record<string, unknown> | null,
      after: data as Record<string, unknown>,
    });

    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to update brand campaign");
  }
}
