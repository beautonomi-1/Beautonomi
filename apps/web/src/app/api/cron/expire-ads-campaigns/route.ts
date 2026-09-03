/**
 * GET /api/cron/expire-ads-campaigns
 *
 * Ends time-based ad campaigns that have passed their end_at date.
 * Also ends CPC/pack campaigns that have exhausted their budget.
 * Notifies providers and refunds unused CPC/pack budget on end.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { notifyAdsCampaignEvent } from "@/lib/ads/notify-ads-campaign-event";
import { refundUnusedAdsBudget } from "@/lib/ads/refund-unused-ads-budget";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "expire-ads-campaigns";
export const maxDuration = 300;

type CampaignRow = {
  id: string;
  provider_id: string;
  budget: number | string | null;
  spent: number | string | null;
  billing_model?: string | null;
  status?: string;
  budget_low_notified_at?: string | null;
  budget_exhausted_notified_at?: string | null;
  campaign_ended_notified_at?: string | null;
};

async function notifyAndRefundEnded(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rows: CampaignRow[],
  event: "budget_exhausted" | "campaign_ended",
  reason: string,
) {
  const nowIso = new Date().toISOString();
  for (const row of rows) {
    const dedupCol =
      event === "budget_exhausted" ? "budget_exhausted_notified_at" : "campaign_ended_notified_at";
    if (row[dedupCol as keyof CampaignRow]) continue;

    await notifyAdsCampaignEvent({
      supabase,
      providerId: row.provider_id,
      campaignId: row.id,
      event: event === "budget_exhausted" ? "budget_exhausted" : "campaign_ended",
      reason,
    });

    if (event === "campaign_ended" || event === "budget_exhausted") {
      await refundUnusedAdsBudget({
        supabase,
        campaignId: row.id,
        providerId: row.provider_id,
        reason,
      }).catch((err) => console.warn("[expire-ads] refund failed:", err));
    }

    await supabase
      .from("ads_campaigns")
      .update({ [dedupCol]: nowIso, updated_at: nowIso })
      .eq("id", row.id);
  }
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: timeExpired } = await supabase
    .from("ads_campaigns")
    .update({ status: "ended", updated_at: now })
    .eq("status", "active")
    .eq("billing_model", "time_based")
    .lt("end_at", now)
    .select("id, provider_id, budget, spent, billing_model, budget_exhausted_notified_at, campaign_ended_notified_at");

  await notifyAndRefundEnded(
    supabase,
    (timeExpired ?? []) as CampaignRow[],
    "campaign_ended",
    "schedule_expired",
  );

  let budgetExpiredIds: string[] = [];
  const { data: rpcEnded } = await supabase.rpc("expire_overspent_ads_campaigns");
  if (Array.isArray(rpcEnded)) {
    budgetExpiredIds = rpcEnded.map((r: { id?: string }) => String(r.id ?? "")).filter(Boolean);
  }

  if (budgetExpiredIds.length === 0) {
    const { data: overspent } = await supabase
      .from("ads_campaigns")
      .select("id, budget, spent, provider_id, billing_model, budget_exhausted_notified_at, campaign_ended_notified_at")
      .eq("status", "active")
      .eq("billing_model", "cpc_budget");

    const toEnd = (overspent ?? []).filter(
      (c: CampaignRow) => Number(c.spent) >= Number(c.budget) && Number(c.budget) > 0,
    );

    if (toEnd.length > 0) {
      budgetExpiredIds = toEnd.map((c: CampaignRow) => c.id);
      await supabase
        .from("ads_campaigns")
        .update({ status: "ended", updated_at: now })
        .in("id", budgetExpiredIds);
    }

    await notifyAndRefundEnded(supabase, toEnd as CampaignRow[], "budget_exhausted", "budget_exhausted");
  } else {
    const { data: endedRows } = await supabase
      .from("ads_campaigns")
      .select("id, provider_id, budget, spent, billing_model, budget_exhausted_notified_at, campaign_ended_notified_at")
      .in("id", budgetExpiredIds);
    await notifyAndRefundEnded(
      supabase,
      (endedRows ?? []) as CampaignRow[],
      "budget_exhausted",
      "budget_exhausted",
    );
  }

  const { data: packCampaigns } = await supabase
    .from("ads_campaigns")
    .select("id, pack_impressions, provider_id, budget, spent, billing_model, budget_exhausted_notified_at, campaign_ended_notified_at")
    .eq("status", "active")
    .eq("billing_model", "impression_pack")
    .not("pack_impressions", "is", null);

  const exhaustedPackRows: CampaignRow[] = [];
  if (packCampaigns && packCampaigns.length > 0) {
    for (const campaign of packCampaigns as CampaignRow[]) {
      const { count } = await supabase
        .from("ads_events")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("event_type", "impression");

      if ((count ?? 0) >= Number((campaign as { pack_impressions?: number }).pack_impressions)) {
        exhaustedPackRows.push(campaign);
      }
    }

    if (exhaustedPackRows.length > 0) {
      await supabase
        .from("ads_campaigns")
        .update({ status: "ended", updated_at: now })
        .in(
          "id",
          exhaustedPackRows.map((c) => c.id),
        );
      await notifyAndRefundEnded(
        supabase,
        exhaustedPackRows,
        "budget_exhausted",
        "impression_pack_exhausted",
      );
    }
  }

  // Budget-low sweep (80%): active CPC/pack campaigns not yet notified.
  const { data: activeBudgetCampaigns } = await supabase
    .from("ads_campaigns")
    .select("id, provider_id, budget, spent, budget_low_notified_at")
    .eq("status", "active")
    .in("billing_model", ["cpc_budget", "impression_pack"])
    .is("budget_low_notified_at", null)
    .gt("budget", 0);

  let budgetLowNotified = 0;
  for (const c of (activeBudgetCampaigns ?? []) as CampaignRow[]) {
    const budget = Number(c.budget ?? 0);
    const spent = Number(c.spent ?? 0);
    if (budget <= 0) continue;
    const pct = (spent / budget) * 100;
    if (pct < 80) continue;
    await notifyAdsCampaignEvent({
      supabase,
      providerId: c.provider_id,
      campaignId: c.id,
      event: "budget_low",
      percentUsed: pct,
    });
    await supabase
      .from("ads_campaigns")
      .update({ budget_low_notified_at: now, updated_at: now })
      .eq("id", c.id);
    budgetLowNotified++;
  }

  return NextResponse.json({
    ok: true,
    expired: {
      time_based: (timeExpired ?? []).length,
      budget_exhausted: budgetExpiredIds.length || exhaustedPackRows.length,
      impression_pack_exhausted: exhaustedPackRows.length,
      budget_low_notified: budgetLowNotified,
    },
  });
}
