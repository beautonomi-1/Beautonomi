import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "purge-ads-events";
export const maxDuration = 300;

const RETENTION_DAYS = 180;
const BATCH_LIMIT = 20_000;
const MAX_BATCHES = 40;
/** Stop looping with headroom before Vercel's maxDuration. */
const TIME_BUDGET_MS = 240_000;

/**
 * GET /api/cron/purge-ads-events (Part M retention)
 *
 * Raw `ads_events` older than 180 days are rolled up into `ads_events_daily`
 * (provider × campaign × event_type × UTC day) and then deleted, one bounded batch per
 * transaction via `rollup_and_purge_ads_events` (migration 877). Aggregates survive
 * for reporting; per-event rows (and their attribution JSON) do not.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, runJob);
}

async function runJob() {
  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const before = new Date(startedAt - RETENTION_DAYS * 86_400_000).toISOString();

  let deleted = 0;
  let dailyRowsUpserted = 0;
  let batches = 0;

  try {
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const { data, error } = await supabase.rpc("rollup_and_purge_ads_events" as never, {
        p_before: before,
        p_batch_limit: BATCH_LIMIT,
      } as never);
      if (error) throw error;
      batches += 1;
      const row = (data ?? {}) as { deleted?: number | string; daily_rows_upserted?: number | string };
      const d = Number(row.deleted ?? 0);
      deleted += d;
      dailyRowsUpserted += Number(row.daily_rows_upserted ?? 0);
      if (d < BATCH_LIMIT) break;
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      batches,
      deleted,
      daily_rows_upserted: dailyRowsUpserted,
      before,
    });
  } catch (err) {
    console.error(`${JOB_NAME}: error`, err);
    return NextResponse.json(
      {
        ok: false,
        job: JOB_NAME,
        error: err instanceof Error ? err.message : "Purge failed",
        deleted,
        daily_rows_upserted: dailyRowsUpserted,
      },
      { status: 500 },
    );
  }
}
