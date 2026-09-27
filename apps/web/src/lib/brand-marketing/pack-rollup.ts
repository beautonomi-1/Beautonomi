import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDemandFunnel, buildSupplyFunnel } from "./funnel";
import { fetchMeasuredForCampaign } from "./measured";
import { sumEnteredPlacementMetrics } from "./placement-metrics";

export async function rollupTenantBrandPack(
  supabase: SupabaseClient,
  tenantId: string,
  period: { start: Date; end: Date },
) {
  const { data: campaigns } = await supabase
    .from("brand_campaigns")
    .select("id, tracking_code, success_metric")
    .eq("tenant_id", tenantId);

  const list = campaigns ?? [];
  const { data: placements } = await supabase
    .from("brand_placements")
    .select(
      "id, campaign_id, tracking_code, promotion_id, coupon_id, referral_code, referral_program, ads_campaign_id, broadcast_log_id, waitlist_city",
    )
    .eq("tenant_id", tenantId);

  const placementRows = placements ?? [];
  const placementIds = placementRows.map((p) => p.id);
  const entered = await sumEnteredPlacementMetrics(supabase, placementIds, period);

  let demandMeasured = {
    signups: 0,
    promo_redemptions: 0,
    promo_discount: 0,
    promo_booking_value: 0,
    attributed_booking_value: 0,
    coupon_redeems: 0,
    referral_completions: 0,
    referral_rewards: 0,
    ads_clicks: 0,
    broadcast_recipients: 0,
    waitlist_rows: 0,
    leads_created: 0,
    leads_won: 0,
  };

  let supplyCampaigns = 0;
  for (const camp of list) {
    const campPlacements = placementRows.filter((p) => p.campaign_id === camp.id);
    const subCodes = campPlacements.map((p) => p.tracking_code).filter(Boolean) as string[];
    const measured = await fetchMeasuredForCampaign(
      supabase,
      tenantId,
      camp.tracking_code,
      subCodes,
      period,
      {
        promotionIds: campPlacements.map((p) => p.promotion_id).filter(Boolean) as string[],
        couponIds: campPlacements.map((p) => p.coupon_id).filter(Boolean) as string[],
        referralCodes: campPlacements.map((p) => p.referral_code).filter(Boolean) as string[],
        referralProgram: campPlacements.some((p) => p.referral_program),
        adsCampaignIds: campPlacements.map((p) => p.ads_campaign_id).filter(Boolean) as string[],
        broadcastLogIds: campPlacements.map((p) => p.broadcast_log_id).filter(Boolean) as string[],
        waitlistCity: campPlacements.find((p) => p.waitlist_city)?.waitlist_city,
      },
    );
    if (camp.success_metric === "supply") supplyCampaigns += 1;
    demandMeasured.signups += measured.signups;
    demandMeasured.promo_redemptions += measured.promo_redemptions;
    demandMeasured.ads_clicks += measured.ads_clicks;
    demandMeasured.leads_created += measured.leads_created;
    demandMeasured.leads_won += measured.leads_won;
    demandMeasured.promo_booking_value += measured.promo_booking_value;
    demandMeasured.attributed_booking_value += measured.attributed_booking_value;
  }

  const primaryCode = list[0]?.tracking_code ?? "brand";
  const demandFunnel = buildDemandFunnel({
    trackingCode: primaryCode,
    measured: demandMeasured,
    enteredReach: entered.reach,
    enteredClicks: entered.clicks,
  });

  const supplyFunnel = supplyCampaigns > 0 ? buildSupplyFunnel({ measured: demandMeasured }) : null;

  return {
    demand: demandFunnel,
    supply: supplyFunnel,
    totals: {
      attributed_signups: demandMeasured.signups,
      promo_redemptions: demandMeasured.promo_redemptions,
      entered_clicks: entered.clicks + demandMeasured.ads_clicks,
      entered_reach: entered.reach,
      leads_created: demandMeasured.leads_created,
      leads_won: demandMeasured.leads_won,
      campaign_count: list.length,
    },
  };
}
