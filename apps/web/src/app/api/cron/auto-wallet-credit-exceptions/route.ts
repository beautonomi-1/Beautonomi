import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { runAutoWalletCreditExceptions } from "@/lib/finance/run-auto-wallet-credit-exceptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const JOB_NAME = "auto-wallet-credit-exceptions";

/**
 * Retries eligible wallet credits when finance auto-credit is enabled; notifies on remaining exceptions.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    try {
      const supabase = getSupabaseAdmin();
      const summary = await runAutoWalletCreditExceptions(supabase);
      return NextResponse.json({ ok: true, summary });
    } catch (error) {
      console.error("[auto-wallet-credit-exceptions]", error);
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Auto wallet credit job failed",
        },
        { status: 500 },
      );
    }
  });
}
