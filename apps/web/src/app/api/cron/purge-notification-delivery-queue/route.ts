import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "purge-notification-delivery-queue";
export const maxDuration = 120;

const DELIVERED_RETENTION_DAYS = 7;
const DEAD_LETTER_RETENTION_DAYS = 30;
const BATCH_LIMIT = 20_000;
const MAX_BATCHES = 20;
/** Stop looping with headroom before Vercel's maxDuration. */
const TIME_BUDGET_MS = 90_000;

/**
 * GET /api/cron/purge-notification-delivery-queue (Part M retention)
 *
 * Deletes `notification_delivery_queue` rows that are:
 *   - `delivered`   older than 7 days  (by delivered_at, else updated_at)
 *   - `dead_letter` older than 30 days (by dead_lettered_at, else updated_at)
 *
 * Runs the SQL function `purge_notification_delivery_queue` (migration 877) in
 * bounded batches so a large backlog never holds long locks. Pending/failed rows
 * are never touched — those belong to process-notification-queue.
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
  const deliveredBefore = new Date(startedAt - DELIVERED_RETENTION_DAYS * 86_400_000).toISOString();
  const deadLetterBefore = new Date(startedAt - DEAD_LETTER_RETENTION_DAYS * 86_400_000).toISOString();

  let deliveredDeleted = 0;
  let deadLetterDeleted = 0;
  let batches = 0;

  try {
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const { data, error } = await supabase.rpc("purge_notification_delivery_queue" as never, {
        p_delivered_before: deliveredBefore,
        p_dead_letter_before: deadLetterBefore,
        p_batch_limit: BATCH_LIMIT,
      } as never);
      if (error) throw error;
      batches += 1;
      const row = (data ?? {}) as { delivered_deleted?: number | string; dead_letter_deleted?: number | string };
      const d = Number(row.delivered_deleted ?? 0);
      const dl = Number(row.dead_letter_deleted ?? 0);
      deliveredDeleted += d;
      deadLetterDeleted += dl;
      if (d < BATCH_LIMIT && dl < BATCH_LIMIT) break;
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      batches,
      delivered_deleted: deliveredDeleted,
      dead_letter_deleted: deadLetterDeleted,
      delivered_before: deliveredBefore,
      dead_letter_before: deadLetterBefore,
    });
  } catch (err) {
    console.error(`${JOB_NAME}: error`, err);
    return NextResponse.json(
      {
        ok: false,
        job: JOB_NAME,
        error: err instanceof Error ? err.message : "Purge failed",
        delivered_deleted: deliveredDeleted,
        dead_letter_deleted: deadLetterDeleted,
      },
      { status: 500 },
    );
  }
}
