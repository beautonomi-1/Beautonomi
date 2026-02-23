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
      .select("id, status, budget, spent, bid_cpc, created_at")
      .eq("provider_id", providerId);
    const totalSpent = (campaigns ?? []).reduce((s: number, c: any) => s + Number(c.spent ?? 0), 0);

    const byCampaign: Record<string, { impressions: number; clicks: number; books: number; spent: number }> = {};
    for (const e of events ?? []) {
      const cid = e.campaign_id ?? "uncategorized";
      if (!byCampaign[cid]) byCampaign[cid] = { impressions: 0, clicks: 0, books: 0, spent: 0 };
      if (e.event_type === "impression") byCampaign[cid].impressions += 1;
      if (e.event_type === "click") byCampaign[cid].clicks += 1;
      if (e.event_type === "book") byCampaign[cid].books += 1;
    }
    for (const c of campaigns ?? []) {
      if (!byCampaign[c.id]) byCampaign[c.id] = { impressions: 0, clicks: 0, books: 0, spent: 0 };
      byCampaign[c.id].spent = Number(c.spent ?? 0);
    }

    return successResponse({
      summary: {
        impressions,
        clicks,
        spend: totalSpent,
        sales: books,
      },
      by_campaign: byCampaign,
      events: (events ?? []).slice(0, 100),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to load ad performance");
  }
}
