/**
 * GET /api/cron/expire-pending-provider-subscription-orders
 *
 * Fails abandoned provider subscription checkouts so late Paystack webhooks
 * cannot activate a superseded order after the provider started a newer one.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const JOB_NAME = "expire-pending-provider-subscription-orders";
const DEFAULT_TTL_MINUTES = 30;
const BATCH_LIMIT = 200;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }

  const ttlMinutes = (() => {
    const raw = Number(process.env.PENDING_ORDER_TTL_MINUTES);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES;
  })();

  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const { data: stale, error } = await supabase
    .from("provider_subscription_orders")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[expire-pending-provider-subscription-orders]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (stale ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, failed: 0, ttl_minutes: ttlMinutes });
  }

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from("provider_subscription_orders")
    .update({
      status: "failed",
      failure_reason: "Payment was not completed in time",
      failed_at: now,
      updated_at: now,
    })
    .in("id", ids)
    .eq("status", "pending")
    .select("id");

  return NextResponse.json({
    ok: true,
    failed: updated?.length ?? 0,
    ttl_minutes: ttlMinutes,
  });
}
