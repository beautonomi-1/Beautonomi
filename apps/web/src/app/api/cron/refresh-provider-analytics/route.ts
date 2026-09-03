import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "refresh-provider-analytics";

/**
 * F8 — Nightly refresh of provider_analytics_daily.
 *
 * Refreshes the last 8 days of rows so late-arriving bookings / refunds /
 * payouts still update the roll-up. The DB function is idempotent (upsert on
 * (provider_id, as_of)) so repeated invocations are safe.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const until = new Date();
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - 8);

    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

    const { data, error } = await admin.rpc("refresh_provider_analytics_daily", {
      p_since: toIsoDate(since),
      p_until: toIsoDate(until),
    });

    if (error) {
      console.error("[refresh-provider-analytics]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? 0,
      since: toIsoDate(since),
      until: toIsoDate(until),
    });
  });
}
