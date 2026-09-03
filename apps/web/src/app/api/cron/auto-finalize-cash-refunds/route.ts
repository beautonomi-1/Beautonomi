import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { autoFinalizeExpiredCashRefunds } from "@/lib/bookings/cash-refund-confirmation";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "auto-finalize-cash-refunds";
export const maxDuration = 60;

/**
 * GET /api/cron/auto-finalize-cash-refunds
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const supabaseAdmin = getSupabaseAdmin();
    const finalized = await autoFinalizeExpiredCashRefunds(supabaseAdmin);
    return NextResponse.json({ ok: true, finalized });
  });
}
