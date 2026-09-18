import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { reconcileDesyncedAppleFreeRows } from "@/lib/iap/apple/reconcile-desynced-apple-free-rows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const JOB_NAME = "reconcile-desynced-apple-free-rows";

/**
 * GET /api/cron/reconcile-desynced-apple-free-rows
 *
 * Fixes free-tier subscription rows that still have entitled Apple txs on file.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json(
      { ok: false, error: auth.error ?? "unauthorized" },
      { status: 401 },
    );
  }
  return runLockedCronRoute(JOB_NAME, async () => {
    const supabase = getSupabaseAdmin();
    const result = await reconcileDesyncedAppleFreeRows({ supabase });
    return NextResponse.json({ ok: true, ...result });
  });
}
