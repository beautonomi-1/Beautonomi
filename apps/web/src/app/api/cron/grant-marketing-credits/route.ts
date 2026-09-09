import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grantMonthlyIncludedCredits } from "@/lib/marketing/credits";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { resolveIncludedMonthlyCreditZar } from "@/lib/marketing/included-credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const JOB_NAME = "grant-marketing-credits";
const PAGE_SIZE = 500;

/**
 * GET /api/cron/grant-marketing-credits
 * Monthly reset of plan-included marketing credits (1st of month).
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const periodKey = new Date().toISOString().slice(0, 7);

  let granted = 0;
  let offset = 0;

  while (true) {
    const { data: subs, error } = await supabase
      .from("provider_subscriptions")
      .select("provider_id, subscription_plans(features)")
      .eq("status", "active")
      .order("provider_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("[grant-marketing-credits] query failed", error);
      break;
    }

    if (!subs?.length) {
      break;
    }

    for (const sub of subs) {
      const plan = sub.subscription_plans as { features?: Record<string, unknown> } | null;
      const grant = resolveIncludedMonthlyCreditZar(plan?.features);
      if (grant <= 0) continue;
      try {
        await grantMonthlyIncludedCredits(supabase, sub.provider_id as string, grant, periodKey);
        granted++;
      } catch (e) {
        console.warn("[grant-marketing-credits]", sub.provider_id, e);
      }
    }

    if (subs.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return NextResponse.json({ ok: true, granted, period: periodKey });
}
