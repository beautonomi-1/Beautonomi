import type { SupabaseClient } from "@supabase/supabase-js";
import { codesForRollup } from "./codes";

export type MeasuredCampaignSlice = {
  signups: number;
  promo_redemptions: number;
  promo_discount: number;
  promo_booking_value: number;
  attributed_booking_value: number;
  coupon_redeems: number;
  referral_completions: number;
  referral_rewards: number;
  ads_clicks: number;
  broadcast_recipients: number;
  waitlist_rows: number;
  leads_created: number;
  leads_won: number;
};

export async function fetchMeasuredForCampaign(
  supabase: SupabaseClient,
  tenantId: string,
  trackingCode: string,
  subCodes: string[],
  window: { start: Date; end: Date },
  placementLinks: {
    promotionIds: string[];
    couponIds: string[];
    referralCodes: string[];
    referralProgram: boolean;
    adsCampaignIds: string[];
    broadcastLogIds: string[];
    waitlistCity?: string | null;
  },
): Promise<MeasuredCampaignSlice> {
  const codes = codesForRollup(trackingCode, subCodes);
  const startIso = window.start.toISOString();
  const endIso = window.end.toISOString();

  let signups = 0;
  if (codes.length) {
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("first_touch_utm_campaign", codes)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    signups = count ?? 0;
  }

  let promo_redemptions = 0;
  let promo_discount = 0;
  let promo_booking_value = 0;
  if (placementLinks.promotionIds.length) {
    const { data: usage } = await supabase
      .from("promotion_usage")
      .select("discount_amount, booking_id")
      .in("promotion_id", placementLinks.promotionIds)
      .gte("used_at", startIso)
      .lte("used_at", endIso);
    promo_redemptions = usage?.length ?? 0;
    promo_discount = (usage ?? []).reduce((s, r) => s + Number(r.discount_amount ?? 0), 0);
    const bookingIds = (usage ?? []).map((u) => u.booking_id).filter(Boolean) as string[];
    if (bookingIds.length) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount")
        .in("id", bookingIds)
        .eq("tenant_id", tenantId)
        .eq("status", "completed");
      promo_booking_value = (bookings ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    }
  }

  let attributed_booking_value = 0;
  if (codes.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id")
      .in("first_touch_utm_campaign", codes);
    const userIds = (users ?? []).map((u) => u.id);
    if (userIds.length) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount, id")
        .eq("tenant_id", tenantId)
        .eq("status", "completed")
        .in("customer_id", userIds)
        .gte("scheduled_at", startIso)
        .lte("scheduled_at", endIso);
      attributed_booking_value = (bookings ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    }
  }

  let coupon_redeems = 0;
  if (placementLinks.couponIds.length) {
    const { count } = await supabase
      .from("user_coupons")
      .select("id", { count: "exact", head: true })
      .in("coupon_id", placementLinks.couponIds)
      .gte("redeemed_at", startIso)
      .lte("redeemed_at", endIso);
    coupon_redeems = count ?? 0;
  }

  let referral_completions = 0;
  let referral_rewards = 0;
  if (placementLinks.referralProgram || placementLinks.referralCodes.length) {
    let q = supabase
      .from("user_referrals")
      .select("reward_amount, status, referral_code")
      .eq("status", "completed")
      .gte("completed_at", startIso)
      .lte("completed_at", endIso);
    if (!placementLinks.referralProgram && placementLinks.referralCodes.length) {
      q = q.in("referral_code", placementLinks.referralCodes);
    }
    const { data: refs } = await q;
    referral_completions = refs?.length ?? 0;
    referral_rewards = (refs ?? []).reduce((s, r) => s + Number(r.reward_amount ?? 0), 0);
  }

  let ads_clicks = 0;
  if (placementLinks.adsCampaignIds.length) {
    const { count } = await supabase
      .from("ads_events")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", placementLinks.adsCampaignIds)
      .eq("event_type", "click")
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    ads_clicks = count ?? 0;
  }

  let broadcast_recipients = 0;
  if (placementLinks.broadcastLogIds.length) {
    const { data: logs } = await supabase
      .from("broadcast_logs")
      .select("recipient_count")
      .in("id", placementLinks.broadcastLogIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    broadcast_recipients = (logs ?? []).reduce((s, l) => s + Number(l.recipient_count ?? 0), 0);
  }

  let waitlist_rows = 0;
  {
    let wq = supabase
      .from("city_waitlist")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    if (placementLinks.waitlistCity) {
      wq = wq.ilike("city_name", placementLinks.waitlistCity);
    }
    const { count } = await wq;
    waitlist_rows = count ?? 0;
  }

  let leads_created = 0;
  let leads_won = 0;
  {
    // provider_leads.source is a fixed enum; the campaign code lives in campaign_id.
    const { data: leads } = await supabase
      .from("provider_leads")
      .select("commercial_stage")
      .eq("tenant_id", tenantId)
      .in("campaign_id", codes)
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    leads_created = leads?.length ?? 0;
    leads_won = (leads ?? []).filter(
      (l) => l.commercial_stage === "won" || l.commercial_stage === "matched",
    ).length;
  }

  return {
    signups,
    promo_redemptions,
    promo_discount,
    promo_booking_value,
    attributed_booking_value,
    coupon_redeems,
    referral_completions,
    referral_rewards,
    ads_clicks,
    broadcast_recipients,
    waitlist_rows,
    leads_created,
    leads_won,
  };
}

export async function autoBindPlacements(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string,
  trackingCode: string,
): Promise<void> {
  const { data: promo } = await supabase
    .from("promotions")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("provider_id", null)
    .ilike("code", trackingCode)
    .maybeSingle();
  const { data: coupon } = await supabase.from("coupons").select("id").ilike("code", trackingCode).maybeSingle();
  const { data: refUser } = await supabase
    .from("users")
    .select("referral_code")
    .ilike("referral_code", trackingCode)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (promo?.id) patch.promotion_id = promo.id;
  if (coupon?.id) patch.coupon_id = coupon.id;
  if (refUser?.referral_code) patch.referral_code = refUser.referral_code;

  if (Object.keys(patch).length) {
    await supabase
      .from("brand_placements")
      .update(patch)
      .eq("campaign_id", campaignId)
      .eq("tenant_id", tenantId)
      .is("promotion_id", null)
      .is("coupon_id", null);
  }
}
