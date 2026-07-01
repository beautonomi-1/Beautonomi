import type { SupabaseClient } from "@supabase/supabase-js";
import { complianceSnapshotPurgeAfterDate } from "@/lib/account/account-deletion-config";

export type CompliancePurgeType = "user" | "provider_org" | "tenant_reset";

export type CompliancePurgeReportV2 = {
  schema_version: 2 | 3;
  purge_type: CompliancePurgeType;
  started_at: string;
  completed_at: string;
  safeguards: {
    confirmation_phrase_verified: boolean;
    target_email_match_verified: boolean;
    regulatory_acknowledgement: boolean;
    reason_min_length_met: boolean;
  };
  actor: { user_id: string; role?: string | null };
  tenant_id: string | null;
  reason_redacted_length: number;
  operations: {
    compliance_clear_user_references_rpc: boolean;
    message_attachment_storage_objects_removed: number;
    auth_users_deleted: string[];
    /** For tenant_reset only — per-table rows removed (or counted, if dry_run). */
    tenant_reset_counts?: Record<string, { rows?: number; via?: string; skipped?: string }>;
    tenant_reset_dry_run?: boolean;
    tenant_reset_allowed_default_tenant?: boolean;
  };
  snapshot?: unknown;
  per_user_snapshots?: unknown[];
};

/**
 * Detects the two classes of schema-drift errors that indicate the DB column
 * exists but the PostgREST schema cache hasn't been reloaded, or that the
 * column genuinely doesn't exist yet in this environment.
 *
 *   • Postgres SQLSTATE 42703  — "column … does not exist"
 *   • PostgREST PGRST204       — "Could not find the column … in the schema cache"
 *   • Free-text fallback       — message mentions the column name or "schema cache"
 */
function isSchemaCacheError(err: { code?: string; message?: string }): boolean {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("purge_after_at") ||
    msg.includes("schema cache")
  );
}

export type CompliancePurgeAuditResult =
  | { ok: true; id: string; degraded?: boolean }
  | { ok: false; error: string };

export async function insertCompliancePurgeAuditLog(
  admin: SupabaseClient,
  row: {
    actor_user_id: string | null;
    tenant_id: string | null;
    purge_type: CompliancePurgeType;
    target_user_id: string | null;
    provider_id: string | null;
    reason: string;
    report: CompliancePurgeReportV2;
    purged_user_ids: string[];
    purge_after_at?: string | null;
  },
): Promise<CompliancePurgeAuditResult> {
  const purgeAfter =
    row.purge_after_at ?? complianceSnapshotPurgeAfterDate().toISOString();

  const basePayload = {
    actor_user_id: row.actor_user_id,
    tenant_id: row.tenant_id,
    purge_type: row.purge_type,
    target_user_id: row.target_user_id,
    provider_id: row.provider_id,
    reason: row.reason.trim(),
    report: row.report as Record<string, unknown>,
    purged_user_ids: row.purged_user_ids,
  };

  // Primary attempt: include purge_after_at (requires migration 694/723).
  const { data, error } = await admin
    .from("compliance_purge_audit_log")
    .insert({ ...basePayload, purge_after_at: purgeAfter })
    .select("id")
    .single();

  if (!error && data) {
    return { ok: true, id: (data as { id: string }).id };
  }

  // If the failure is a schema-cache / missing-column error, retry without
  // purge_after_at so the immutable audit row is always written.  The missing
  // retention date is a data-quality degradation, not a compliance blocker.
  // Migration 723 will backfill purge_after_at once it is applied.
  if (error && isSchemaCacheError(error)) {
    const { data: fallbackData, error: fallbackError } = await admin
      .from("compliance_purge_audit_log")
      .insert(basePayload)
      .select("id")
      .single();

    if (!fallbackError && fallbackData) {
      return { ok: true, id: (fallbackData as { id: string }).id, degraded: true };
    }

    return {
      ok: false,
      error: fallbackError?.message ?? "Failed to write compliance purge audit log (fallback also failed)",
    };
  }

  return { ok: false, error: error?.message ?? "Failed to write compliance purge audit log" };
}
