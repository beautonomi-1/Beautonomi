/**
 * GET /api/provider/ads/performance - Ad performance: impressions, clicks, spend, sales (bookings from ads)
 * Query: start_date, end_date, campaign_id (optional)
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

export async function GET(request: NextRequest) {
  try {
    const providerId = await getProviderId(request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date") ?? undefined;
    const endDate = searchParams.get("end_date") ?? undefined;
    const campaignId = searchParams.get("campaign_id") ?? undefined;

    const supabase = getSupabaseAdmin();

    let eventsQuery = supabase
      .from("ads_events")
      .select("id, campaign_id, event_type, created_at, attribution")
      .eq("provider_id", providerId);
    if (startDate) eventsQuery = eventsQuery.gte("created_at", startDate);
    if (endDate) eventsQuery = eventsQuery.lte("created_at", endDate);
    if (campaignId) eventsQuery = eventsQuery.eq("campaign_id", campaignId);
    const { data: events } = await eventsQuery.order("created_at", { ascending: false });

    const impressions = (events ?? []).filter((e: any) => e.event_type === "impression").length;
    const clicks = (events ?? []).filter((e: any) => e.event_type === "click").length;
    const books = (events ?? []).filter((e: any) => e.event_type === "book").length;

    const { data: campaigns } = await supabase
      .from("ads_campaigns")
      .select(
        "id, status, budget, spent, bid_cpc, billing_model, pack_impressions, duration_days, start_at, end_at, created_at",
      )
      .eq("provider_id", providerId);
    const lifetimeSpent = (campaigns ?? []).reduce((s: number, c: any) => s + Number(c.spent ?? 0), 0);

    /**
     * §Release-audit 2026-04: previously computed period spend as
     * `clicks * bid_cpc`. That is wrong on multiple counts:
     *   1. Spend is charged on IMPRESSIONS by the DB trigger
     *      `ads_charge_on_impression`, not on clicks.
     *   2. Time-based campaigns and impression packs do not use `bid_cpc`.
     *   3. Without the cost-per-impression ratio from `ads_module_config`,
     *      CPC-bid-only math undercounts real spend.
     * Mirror the DB charge model here on a per-impression basis, capped
     * at the campaign's budget so the dashboard agrees with `spent`.
     */
    const COST_RATIO_DEFAULT = 1;
    let cpcCostRatio = COST_RATIO_DEFAULT;
    try {
      const { data: cfg } = await supabase
        .from("ads_module_config")
        .select("cost_per_impression_ratio")
        .eq("environment", "production")
        .maybeSingle();
      const r = Number((cfg as { cost_per_impression_ratio?: number } | null)?.cost_per_impression_ratio);
      if (Number.isFinite(r) && r > 0) cpcCostRatio = r;
    } catch {
      /* fall back to default ratio */
    }

    const campaignMap = new Map<string, any>();
    for (const c of campaigns ?? []) campaignMap.set(c.id, c);

    const costForImpression = (cid: string): number => {
      const c = campaignMap.get(cid);
      if (!c) return 0;
      const billingModel = String(c.billing_model ?? "cpc");
      if (billingModel === "time_based") return 0;
      const pack = Number(c.pack_impressions ?? 0);
      if (pack > 0) {
        const budget = Number(c.budget ?? 0);
        return budget > 0 ? budget / pack : 0;
      }
      const bid = Number(c.bid_cpc ?? 0);
      return bid * cpcCostRatio;
    };

    const hasDateFilter = !!(startDate || endDate);

    const byCampaign: Record<string, { impressions: number; clicks: number; books: number; spent: number }> = {};
    let periodSpent = 0;
    for (const e of events ?? []) {
      const cid = e.campaign_id ?? "uncategorized";
      if (!byCampaign[cid]) byCampaign[cid] = { impressions: 0, clicks: 0, books: 0, spent: 0 };
      if (e.event_type === "impression") {
        byCampaign[cid].impressions += 1;
        const inc = costForImpression(cid);
        byCampaign[cid].spent += inc;
        periodSpent += inc;
      }
      if (e.event_type === "click") byCampaign[cid].clicks += 1;
      if (e.event_type === "book") byCampaign[cid].books += 1;
    }
    // Cap per-campaign period spend by total budget for parity with DB.
    for (const c of campaigns ?? []) {
      if (!byCampaign[c.id]) byCampaign[c.id] = { impressions: 0, clicks: 0, books: 0, spent: 0 };
      const budget = Number(c.budget ?? 0);
      if (budget > 0 && byCampaign[c.id].spent > budget) byCampaign[c.id].spent = budget;
      if (!hasDateFilter) {
        byCampaign[c.id].spent = Number(c.spent ?? 0);
      }
    }
    if (!hasDateFilter) {
      periodSpent = lifetimeSpent;
    } else {
      periodSpent = Object.values(byCampaign).reduce((s, x) => s + x.spent, 0);
    }

    return successResponse({
      summary: {
        impressions,
        clicks,
        spend: periodSpent,
        spend_label: hasDateFilter ? "spend in period (modeled from impressions)" : "lifetime",
        lifetime_spend: lifetimeSpent,
        sales: books,
      },
      by_campaign: byCampaign,
      events: (events ?? []).slice(0, 100),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to load ad performance");
  }
}
