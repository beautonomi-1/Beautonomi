import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { autoFinalizeExpiredCashRefunds } from "@/lib/bookings/cash-refund-confirmation";

/**
 * GET /api/cron/auto-finalize-cash-refunds
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const finalized = await autoFinalizeExpiredCashRefunds(supabaseAdmin);
  return NextResponse.json({ ok: true, finalized });
}
