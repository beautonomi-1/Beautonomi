/**
 * Sponsored ads auction: when a buyer searches, we run an auction to decide which
 * ads appear in the top spots. Placement depends on bid, provider quality score,
 * and relevance (targeting vs search category).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface AuctionParams {
  /** Search category (global_service_categories slug or id) – used for relevance */
  categorySlug?: string | null;
  categoryId?: string | null;
  /** Max number of sponsored slots to return */
  maxSlots: number;
  /** Optional: exclude these provider IDs (e.g. already in organic results) to avoid duplicate */
  excludeProviderIds?: string[];
}

export interface AuctionWinner {
  campaign_id: string;
  provider_id: string;
  bid_cpc: number;
  quality_score: number;
  relevance: number;
}

/**
 * Cost per impression = bid_cpc * COST_PER_IMPRESSION_RATIO (ZAR).
 * Used for auction eligibility (daily cap estimate). Actual charge is applied by DB trigger
 * when an impression row is inserted into ads_events (see migration 261).
 */
export const COST_PER_IMPRESSION_RATIO = 0.05;

/**
 * Run auction: returns ordered list of (campaign_id, provider_id) for sponsored slots.
 * Does not record impressions; caller should record after merging into search results.
 */
export async function runAdsAuction(params: AuctionParams): Promise<AuctionWinner[]> {
  const supabase = getSupabaseAdmin();
  const { categoryId, categorySlug, maxSlots, excludeProviderIds = [] } = params;
  if (maxSlots <= 0) return [];

  const env = process.env.NODE_ENV === "production" ? "production" : "development";
  const { data: config } = await supabase
    .from("ads_module_config")
    .select("enabled, max_sponsored_slots")
    .eq("environment", env)
    .maybeSingle();

  if (!config?.enabled) return [];
  const limit = Math.min(maxSlots, Number(config.max_sponsored_slots) || 5, 10);

  // Resolve category id from slug if needed
  let globalCategoryId: string | null = categoryId ?? null;
  if (!globalCategoryId && categorySlug) {
    const { data: cat } = await supabase
      .from("global_service_categories")
      .select("id")
      .eq("slug", categorySlug)
      .eq("is_active", true)
      .maybeSingle();
    globalCategoryId = cat?.id ?? null;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  // Active campaigns with budget remaining (and optional daily cap; pack campaigns cap by impression count)
  const { data: campaigns } = await supabase
    .from("ads_campaigns")
    .select("id, provider_id, budget, spent, daily_budget, bid_cpc, targeting, pack_impressions")
    .eq("status", "active")
    .gt("budget", 0);

  if (!campaigns?.length) return [];

  const campaignIds = campaigns.map((c: any) => c.id);
  const { data: eventsToday } = await supabase
    .from("ads_events")
    .select("campaign_id")
    .in("campaign_id", campaignIds)
    .gte("created_at", todayStartIso);

  const todayCountByCampaign: Record<string, number> = {};
  (eventsToday ?? []).forEach((e: any) => {
    if (e.campaign_id) todayCountByCampaign[e.campaign_id] = (todayCountByCampaign[e.campaign_id] ?? 0) + 1;
  });

  const packCampaignIds = (campaigns as any[]).filter((c) => c.pack_impressions != null).map((c) => c.id);
  let impressionCountByCampaign: Record<string, number> = {};
  if (packCampaignIds.length > 0) {
    const { data: impressionCounts } = await supabase
      .from("ads_events")
      .select("campaign_id")
      .in("campaign_id", packCampaignIds)
      .eq("event_type", "impression");
    (impressionCounts ?? []).forEach((e: any) => {
      if (e.campaign_id) impressionCountByCampaign[e.campaign_id] = (impressionCountByCampaign[e.campaign_id] ?? 0) + 1;
    });
  }

  const eligible: Array<{
    id: string;
    provider_id: string;
    bid_cpc: number;
    targeting: { global_category_ids?: string[] };
    spent: number;
    daily_budget: number | null;
  }> = [];
  for (const c of campaigns as any[]) {
    if (c.pack_impressions != null) {
      const count = impressionCountByCampaign[c.id] ?? 0;
      if (count >= Number(c.pack_impressions)) continue;
    } else {
      const remaining = Number(c.budget) - Number(c.spent ?? 0);
      if (remaining <= 0) continue;
    }
    if (excludeProviderIds.includes(c.provider_id)) continue;
    const dailyBudget = c.daily_budget != null ? Number(c.daily_budget) : null;
    if (dailyBudget != null) {
      const todayImpressions = todayCountByCampaign[c.id] ?? 0;
      const costPerImp = c.pack_impressions != null ? Number(c.budget) / Number(c.pack_impressions) : Number(c.bid_cpc ?? 0) * COST_PER_IMPRESSION_RATIO;
      if (todayImpressions * costPerImp >= dailyBudget) continue;
    }
    const targeting = (c.targeting && typeof c.targeting === "object") ? c.targeting : {};
    const effectiveBid = c.pack_impressions != null ? Number(c.budget) / Number(c.pack_impressions) : Number(c.bid_cpc ?? 0);
    eligible.push({
      id: c.id,
      provider_id: c.provider_id,
      bid_cpc: effectiveBid,
      targeting: targeting,
      spent: Number(c.spent ?? 0),
      daily_budget: c.daily_budget != null ? Number(c.daily_budget) : null,
    });
  }

  if (eligible.length === 0) return [];

  const providerIds = [...new Set(eligible.map((e) => e.provider_id))];
  const { data: qualityRows } = await supabase
    .from("provider_quality_score")
    .select("provider_id, computed_score")
    .in("provider_id", providerIds);
  const qualityByProvider = new Map<string, number>();
  (qualityRows ?? []).forEach((r: any) => qualityByProvider.set(r.provider_id, Number(r.computed_score ?? 0)));

  // Relevance: 1 if campaign targets this category (or no category filter), else 0.5
  const scoreCandidates: AuctionWinner[] = eligible.map((c) => {
    const quality = qualityByProvider.get(c.provider_id) ?? 0.3;
    const categoryIds = c.targeting?.global_category_ids ?? [];
    const relevance =
      !globalCategoryId ? 1 : categoryIds.length === 0 ? 1 : categoryIds.includes(globalCategoryId) ? 1 : 0.5;
    return {
      campaign_id: c.id,
      provider_id: c.provider_id,
      bid_cpc: c.bid_cpc,
      quality_score: quality,
      relevance,
    };
  });

  // Rank by bid * quality * relevance (desc)
  scoreCandidates.sort((a, b) => {
    const scoreA = a.bid_cpc * (a.quality_score || 0.2) * a.relevance;
    const scoreB = b.bid_cpc * (b.quality_score || 0.2) * b.relevance;
    return scoreB - scoreA;
  });

  const winners = scoreCandidates.slice(0, limit);
  return winners;
}

/**
 * Record impression events for auction winners. Call after merging sponsored results into search.
 * idempotencyKey can be search_request_id or composite of (search, user, timestamp) to avoid double-counting.
 */
export async function recordAdImpressions(
  winners: AuctionWinner[],
  idempotencyPrefix: string
): Promise<void> {
  if (winners.length === 0) return;
  const supabase = getSupabaseAdmin();
  const rows = winners.map((w, i) => ({
    campaign_id: w.campaign_id,
    provider_id: w.provider_id,
    event_type: "impression",
    idempotency_key: `${idempotencyPrefix}:impression:${w.campaign_id}:${i}`,
    attribution: { source: "search", rank: i + 1 },
  }));
  await supabase.from("ads_events").upsert(rows, {
    onConflict: "idempotency_key",
    ignoreDuplicates: true,
  });
}
