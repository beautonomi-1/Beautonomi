import type { SupabaseClient } from "@supabase/supabase-js";

export type CompliancePurgeType = "user" | "provider_org" | "tenant_reset";

export type CompliancePurgeReportV2 = {
  schema_version: 2;
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

export async function insertCompliancePurgeAuditLog(
  admin: SupabaseClient,
  row: {
    actor_user_id: string;
    tenant_id: string | null;
    purge_type: CompliancePurgeType;
    target_user_id: string | null;
    provider_id: string | null;
    reason: string;
    report: CompliancePurgeReportV2;
    purged_user_ids: string[];
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("compliance_purge_audit_log")
    .insert({
      actor_user_id: row.actor_user_id,
      tenant_id: row.tenant_id,
      purge_type: row.purge_type,
      target_user_id: row.target_user_id,
      provider_id: row.provider_id,
      reason: row.reason.trim(),
      report: row.report as Record<string, unknown>,
      purged_user_ids: row.purged_user_ids,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to write compliance purge audit log" };
  }
  return { ok: true, id: (data as { id: string }).id };
}
