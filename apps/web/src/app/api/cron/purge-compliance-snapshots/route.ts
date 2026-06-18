import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/audit";

const BATCH_SIZE = 200;
const MAX_BATCHES = 50;

/**
 * GET /api/cron/purge-compliance-snapshots
 *
 * Deletes compliance_purge_audit_log rows whose purge_after_at has passed.
 * Supports ?dry_run=1 to count without deleting.
 */
export async function GET(request: NextRequest) {
  const { valid, error } = verifyCronRequest(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let totalDeleted = 0;
  const sampleIds: string[] = [];

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data: rows, error: selectErr } = await supabase
        .from("compliance_purge_audit_log")
        .select("id")
        .lt("purge_after_at", now)
        .not("purge_after_at", "is", null)
        .order("purge_after_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (selectErr) throw selectErr;
      if (!rows || rows.length === 0) break;

      const ids = rows.map((r: { id: string }) => r.id);
      if (dryRun) {
        totalDeleted += ids.length;
        if (sampleIds.length < 10) sampleIds.push(...ids.slice(0, 10 - sampleIds.length));
        if (rows.length < BATCH_SIZE) break;
        continue;
      }

      const { error: deleteErr } = await supabase
        .from("compliance_purge_audit_log")
        .delete()
        .in("id", ids);

      if (deleteErr) throw deleteErr;

      totalDeleted += ids.length;
      if (rows.length < BATCH_SIZE) break;
    }

    if (!dryRun) {
      await writeAuditLog({
        action: "system.compliance_purge_audit.purge",
        entity_type: "compliance_purge_audit_log",
        risk_level: "high",
        retention_tier: "permanent",
        status: "succeeded",
        module: "system",
        metadata: {
          total_deleted: totalDeleted,
          purge_cutoff: now,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_deleted: totalDeleted,
      sample_ids: dryRun ? sampleIds : undefined,
    });
  } catch (err) {
    console.error("purge-compliance-snapshots: error", err);

    if (!dryRun) {
      await writeAuditLog({
        action: "system.compliance_purge_audit.purge",
        entity_type: "compliance_purge_audit_log",
        risk_level: "high",
        retention_tier: "permanent",
        status: "failed",
        module: "system",
        metadata: {
          total_deleted: totalDeleted,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Purge failed" },
      { status: 500 },
    );
  }
}
