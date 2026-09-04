/**
 * GET /api/provider/ads/performance - Ad performance: impressions, clicks, spend
 * Query: start_date, end_date, campaign_id (optional)
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  effectiveLifetimeSpendRow,
  filterRangeMsFromParams,
  timeBasedAttributedSpend,
} from "@/lib/ads/ad-performance-spend";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

const ADS_EVENTS_MAX = 50_000;

async function getProviderId(userId: string, request: NextRequest): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  return getProviderIdForUser(userId, supabase as never, { request });
}

function reachKeyForEvent(event: { id?: string; idempotency_key?: string | null; attribution?: any }): string | null {
  const attribution = event.attribution && typeof event.attribution === "object" ? event.attribution : {};
  const explicit =
    attribution.reach_key ||
    attribution.visitor_id ||
    attribution.anonymous_id ||
    attribution.session_id ||
    attribution.user_id ||
    attribution.client_id;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const key = event.idempotency_key;
  if (typeof key === "string" && key.includes(":impression:")) {
    return key.split(":impression:")[0] || null;
  }
  return event.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const providerId = await getProviderId(user.id, request);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date") ?? undefined;
    const endDate = searchParams.get("end_date") ?? undefined;
    const campaignId = searchParams.get("campaign_id") ?? undefined;

    const supabase = getSupabaseAdmin();

    const events = await fetchAllPaged(async (from, to) => {
      let eventsQuery = supabase
        .from("ads_events")
        .select("id, campaign_id, event_type, created_at, attribution, idempotency_key")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (startDate) eventsQuery = eventsQuery.gte("created_at", startDate);
      if (endDate) eventsQuery = eventsQuery.lte("created_at", endDate);
      if (campaignId) eventsQuery = eventsQuery.eq("campaign_id", campaignId);
      return eventsQuery.range(from, to);
    }, ADS_EVENTS_MAX);

    const impressions = (events ?? []).filter((e: any) => e.event_type === "impression").length;
    const clicks = (events ?? []).filter((e: any) => e.event_type === "click").length;
    const reachKeys = new Set<string>();
    for (const event of events ?? []) {
      if ((event as any).event_type !== "impression") continue;
      const reachKey = reachKeyForEvent(event as any);
      if (reachKey) reachKeys.add(reachKey);
    }
    const reach = reachKeys.size;

    const { data: campaigns } = await supabase
      .from("ads_campaigns")
      .select(
        "id, status, budget, spent, bid_cpc, billing_model, pack_impressions, duration_days, start_at, end_at, created_at",
      )
      .eq("provider_id", providerId);
    const lifetimeSpent = (campaigns ?? []).reduce((s: number, c: any) => s + effectiveLifetimeSpendRow(c), 0);

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
    const COST_RATIO_DEFAULT = 0.05;
    let cpcCostRatio = COST_RATIO_DEFAULT;
    try {
      const env = process.env.NODE_ENV === "production" ? "production" : "development";
      const { data: cfg } = await supabase
        .from("ads_module_config")
        .select("cost_per_impression_ratio")
        .eq("environment", env)
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
    const filterRange = hasDateFilter ? filterRangeMsFromParams(startDate, endDate) : null;

    const byCampaign: Record<string, { impressions: number; reach: number; clicks: number; books: number; spent: number }> = {};
    const reachByCampaign = new Map<string, Set<string>>();
    let periodSpent = 0;
    for (const e of events ?? []) {
      if (!e.campaign_id) continue;
      const cid = e.campaign_id;
      if (!byCampaign[cid]) byCampaign[cid] = { impressions: 0, reach: 0, clicks: 0, books: 0, spent: 0 };
      if (e.event_type === "impression") {
        byCampaign[cid].impressions += 1;
        const reachKey = reachKeyForEvent(e as any);
        if (reachKey) {
          if (!reachByCampaign.has(cid)) reachByCampaign.set(cid, new Set<string>());
          reachByCampaign.get(cid)!.add(reachKey);
        }
        const inc = costForImpression(cid);
        byCampaign[cid].spent += inc;
        periodSpent += inc;
      }
      if (e.event_type === "click") byCampaign[cid].clicks += 1;
      if (e.event_type === "book") byCampaign[cid].books += 1;
    }

    if (hasDateFilter && filterRange) {
      for (const c of campaigns ?? []) {
        if (String((c as any).billing_model ?? "") !== "time_based") continue;
        const cid = (c as any).id as string;
        if (campaignId && cid !== campaignId) continue;
        const attributed = timeBasedAttributedSpend(c as any, filterRange);
        if (attributed <= 0) continue;
        if (!byCampaign[cid]) byCampaign[cid] = { impressions: 0, reach: 0, clicks: 0, books: 0, spent: 0 };
        byCampaign[cid].spent += attributed;
      }
    }

    // Cap per-campaign period spend by total budget for parity with DB (CPC / packs).
    for (const c of campaigns ?? []) {
      if (!byCampaign[c.id]) byCampaign[c.id] = { impressions: 0, reach: 0, clicks: 0, books: 0, spent: 0 };
      byCampaign[c.id].reach = reachByCampaign.get(c.id)?.size ?? 0;
      const budget = Number(c.budget ?? 0);
      const bm = String((c as any).billing_model ?? "cpc_budget");
      if (bm !== "time_based" && budget > 0 && byCampaign[c.id].spent > budget) byCampaign[c.id].spent = budget;
      if (!hasDateFilter) {
        byCampaign[c.id].spent = effectiveLifetimeSpendRow(c as any);
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
        reach,
        clicks,
        spend: periodSpent,
        spend_label: hasDateFilter
          ? "spend in period (impressions + time-based overlap)"
          : "lifetime",
        lifetime_spend: lifetimeSpent,
      },
      by_campaign: byCampaign,
      events: (events ?? []).slice(0, 100),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to load ad performance");
  }
}
