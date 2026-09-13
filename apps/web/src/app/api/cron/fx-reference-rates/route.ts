/**

 * GET /api/cron/fx-reference-rates

 * Fetch daily Frankfurter v2 rates into fx_reference_rates (reporting only).

 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { ingestFxReferenceRates } from "@/lib/fx/ingest-reference-rates";
import { slackNotifyFxRatesStale } from "@/lib/integrations/slack/fx-rate-triggers";

const JOB_NAME = "fx-reference-rates";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const supabase = getSupabaseAdmin();
    const summary = await ingestFxReferenceRates(supabase, { throwOnRequiredMissing: true });

    if (summary.stale.length > 0 || summary.warnings.length > 0) {
      await slackNotifyFxRatesStale({
        stale: summary.stale,
        warnings: summary.warnings,
      });
    }

    return NextResponse.json({ ok: true, ...summary });
  });
}
