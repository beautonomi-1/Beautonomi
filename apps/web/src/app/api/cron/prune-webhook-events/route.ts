import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/audit";

const BATCH_SIZE = 1000;
const MAX_BATCHES = 50;
const RETENTION_DAYS_PROCESSED = 90;
const RETENTION_DAYS_FAILED = 365;

/**
 * GET /api/cron/prune-webhook-events (F7)
 *
 * Retention job for the webhook_events table. Deletes:
 *   - `processed` rows older than 90 days
 *   - `failed` / `processing` rows older than 365 days (kept longer for forensic replay)
 *
 * The admin Webhook Explorer only needs recent history; long-term evidence lives in
 * finance_transactions. Leaving full Paystack payloads in the DB forever is a PII risk
 * (customer emails, metadata) and a storage problem.
 */
export async function GET(request: NextRequest) {
  const { valid, error } = verifyCronRequest(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const processedCutoff = new Date(Date.now() - RETENTION_DAYS_PROCESSED * 86_400_000).toISOString();
  const failedCutoff = new Date(Date.now() - RETENTION_DAYS_FAILED * 86_400_000).toISOString();
  let totalDeleted = 0;
  const deletedByStatus: Record<string, number> = {};

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data: rows, error: selectErr } = await supabase
        .from("webhook_events")
        .select("id, status, created_at")
        .or(
          `and(status.eq.processed,created_at.lt.${processedCutoff}),` +
            `and(status.in.(failed,processing),created_at.lt.${failedCutoff})`,
        )
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (selectErr) throw selectErr;
      if (!rows || rows.length === 0) break;

      for (const row of rows as { status: string }[]) {
        deletedByStatus[row.status] = (deletedByStatus[row.status] || 0) + 1;
      }

      const ids = rows.map((r: { id: string }) => r.id);
      const { error: deleteErr } = await supabase
        .from("webhook_events")
        .delete()
        .in("id", ids);
      if (deleteErr) throw deleteErr;

      totalDeleted += ids.length;
      if (rows.length < BATCH_SIZE) break;
    }

    await writeAuditLog({
      action: "system.webhook_events.purge",
      entity_type: "webhook_events",
      risk_level: "medium",
      retention_tier: "permanent",
      status: "succeeded",
      module: "system",
      metadata: {
        total_deleted: totalDeleted,
        deleted_by_status: deletedByStatus,
        processed_cutoff: processedCutoff,
        failed_cutoff: failedCutoff,
      },
    });

    return NextResponse.json({ ok: true, total_deleted: totalDeleted, deleted_by_status: deletedByStatus });
  } catch (err) {
    console.error("prune-webhook-events: error", err);
    await writeAuditLog({
      action: "system.webhook_events.purge",
      entity_type: "webhook_events",
      risk_level: "medium",
      retention_tier: "permanent",
      status: "failed",
      module: "system",
      metadata: {
        total_deleted: totalDeleted,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Purge failed" },
      { status: 500 },
    );
  }
}
