import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/audit";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "purge-audit-logs";
export const maxDuration = 300;

const BATCH_SIZE = 1000;
const MAX_BATCHES = 50;

/**
 * GET /api/cron/purge-audit-logs
 *
 * Retention-based cleanup of audit_logs rows whose purge_after_at has passed.
 * Rows with retention_tier = 'permanent' or purge_after_at IS NULL are never deleted.
 * The purge action itself is logged as an audit entry with permanent retention.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const { valid, error } = verifyCronRequest(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let totalDeleted = 0;
  const deletedByTier: Record<string, number> = {};

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data: rows, error: selectErr } = await supabase
        .from("audit_logs")
        .select("id, retention_tier")
        .lt("purge_after_at", now)
        .neq("retention_tier", "permanent")
        .not("purge_after_at", "is", null)
        .order("purge_after_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (selectErr) throw selectErr;
      if (!rows || rows.length === 0) break;

      const ids = rows.map((r: { id: string }) => r.id);
      for (const r of rows as { retention_tier: string }[]) {
        deletedByTier[r.retention_tier] = (deletedByTier[r.retention_tier] || 0) + 1;
      }

      const { error: deleteErr } = await supabase
        .from("audit_logs")
        .delete()
        .in("id", ids);

      if (deleteErr) throw deleteErr;

      totalDeleted += ids.length;

      if (rows.length < BATCH_SIZE) break;
    }

    await writeAuditLog({
      action: "system.audit_logs.purge",
      entity_type: "audit_logs",
      risk_level: "high",
      retention_tier: "permanent",
      status: "succeeded",
      module: "system",
      metadata: {
        total_deleted: totalDeleted,
        deleted_by_tier: deletedByTier,
        purge_cutoff: now,
      },
    });

    return NextResponse.json({
      ok: true,
      total_deleted: totalDeleted,
      deleted_by_tier: deletedByTier,
    });
  } catch (err) {
    console.error("purge-audit-logs: error", err);

    await writeAuditLog({
      action: "system.audit_logs.purge",
      entity_type: "audit_logs",
      risk_level: "high",
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
