import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchCampaign, type DispatchableCampaign } from "@/lib/marketing/dispatch-campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/dispatch-scheduled-campaigns
 *
 * Sends marketing campaigns whose scheduled time has arrived. Each campaign
 * runs through the shared dispatchCampaign pipeline (identical gating + billing
 * to manual sends). Designed to run every few minutes.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[dispatch-scheduled-campaigns] query failed:", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Campaigns stuck in "sending" beyond the grace window (process crash /
  // timeout mid-send). dispatchCampaign skips already-delivered recipients, so
  // requeuing simply finishes the remainder without re-messaging anyone.
  const STUCK_SENDING_GRACE_MINUTES = 15;
  const stuckCutoffIso = new Date(
    Date.now() - STUCK_SENDING_GRACE_MINUTES * 60_000,
  ).toISOString();
  const { data: stuck, error: stuckError } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("status", "sending")
    .lt("updated_at", stuckCutoffIso)
    .order("updated_at", { ascending: true })
    .limit(25);

  if (stuckError) {
    console.error("[dispatch-scheduled-campaigns] stuck query failed:", stuckError);
  }

  let dispatched = 0;
  let failed = 0;
  let requeued = 0;
  const results: Array<{ id: string; ok: boolean; sent?: number; reason?: string; requeued?: boolean }> = [];

  const toRun: Array<{ campaign: DispatchableCampaign; isRequeue: boolean }> = [
    ...((due ?? []) as DispatchableCampaign[]).map((campaign) => ({ campaign, isRequeue: false })),
    ...((stuck ?? []) as DispatchableCampaign[]).map((campaign) => ({ campaign, isRequeue: true })),
  ];

  for (const { campaign, isRequeue } of toRun) {
    try {
      const result = await dispatchCampaign(supabase, campaign);
      if (result.ok) {
        if (isRequeue) requeued++;
        else dispatched++;
        results.push({ id: campaign.id, ok: true, sent: result.sentCount ?? 0, requeued: isRequeue });
      } else {
        failed++;
        results.push({ id: campaign.id, ok: false, reason: result.message ?? "dispatch failed", requeued: isRequeue });
      }
    } catch (e: any) {
      failed++;
      results.push({ id: campaign.id, ok: false, reason: e?.message || "error", requeued: isRequeue });
      console.error("[dispatch-scheduled-campaigns]", campaign.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    dispatched,
    requeued,
    failed,
    considered: (due?.length ?? 0) + (stuck?.length ?? 0),
    results,
  });
}
