import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "refresh-reports";

/**
 * F25 — Refresh admin reporting materialised views.
 *
 * Runs `public.refresh_reporting_views()` which does
 *  REFRESH MATERIALIZED VIEW CONCURRENTLY on provider_dashboard_daily,
 *  admin_finance_daily, and admin_bookings_daily.
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

    const { data, error } = await admin.rpc("refresh_reporting_views");

    if (error) {
      console.error("[refresh-reports]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  });
}
