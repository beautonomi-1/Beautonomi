/**
 * GET /api/cron/expire-ads-campaigns
 *
 * Ends time-based ad campaigns that have passed their end_at date.
 * Also ends CPC/pack campaigns that have exhausted their budget.
 * Should be called periodically (e.g., every hour via Vercel cron).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // 1. End time-based campaigns past their end_at
  const { data: timeExpired, error: timeErr } = await supabase
    .from("ads_campaigns")
    .update({ status: "ended", updated_at: now })
    .eq("status", "active")
    .eq("billing_model", "time_based")
    .lt("end_at", now)
    .select("id");

  if (timeErr) {
    console.error("Failed to expire time-based campaigns:", timeErr);
  }

  // 2. End CPC budget campaigns that are fully spent
  let budgetExpired: unknown = null;
  let budgetErr: unknown = null;
  try {
    const res = await supabase.rpc("expire_overspent_ads_campaigns");
    budgetExpired = res.data;
    budgetErr = res.error;
  } catch {
    budgetExpired = null;
    budgetErr = null;
  }

  // Fallback: query and update manually if RPC doesn't exist
  if (!budgetExpired) {
    const { data: overspent } = await supabase
      .from("ads_campaigns")
      .select("id, budget, spent")
      .eq("status", "active")
      .eq("billing_model", "cpc_budget");

    const toEnd = (overspent ?? []).filter(
      (c: any) => Number(c.spent) >= Number(c.budget) && Number(c.budget) > 0
    );

    if (toEnd.length > 0) {
      await supabase
        .from("ads_campaigns")
        .update({ status: "ended", updated_at: now })
        .in("id", toEnd.map((c: any) => c.id));
    }
  }

  // 3. End impression pack campaigns that used all impressions.
  // Use per-campaign count queries instead of loading all events into memory.
  const { data: packCampaigns } = await supabase
    .from("ads_campaigns")
    .select("id, pack_impressions")
    .eq("status", "active")
    .eq("billing_model", "impression_pack")
    .not("pack_impressions", "is", null);

  const exhaustedIds: string[] = [];
  if (packCampaigns && packCampaigns.length > 0) {
    for (const campaign of packCampaigns) {
      const { count } = await supabase
        .from("ads_events")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("event_type", "impression");

      if ((count ?? 0) >= Number(campaign.pack_impressions)) {
        exhaustedIds.push(campaign.id);
      }
    }

    if (exhaustedIds.length > 0) {
      await supabase
        .from("ads_campaigns")
        .update({ status: "ended", updated_at: now })
        .in("id", exhaustedIds);
    }
  }

  return NextResponse.json({
    ok: true,
    expired: {
      time_based: (timeExpired ?? []).length,
      budget_exhausted: budgetExpired ? "rpc" : "fallback",
      impression_pack_exhausted: exhaustedIds.length,
    },
  });
}
