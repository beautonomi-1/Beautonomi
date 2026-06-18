import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import {
  insertCompliancePurgeAuditLog,
  type CompliancePurgeReportV2,
} from "@/lib/account/compliance-purge-audit";
import { collectUserPurgeSnapshot, type UserPurgeSnapshot } from "@/lib/account/compliance-purge-snapshot";
import { redactUserPurgeSnapshot } from "@/lib/account/compliance-snapshot-redaction";
import {
  slackNotifySelfServiceAccountDeletionFailed,
  slackNotifySelfServiceAccountDeletionSucceeded,
} from "@/lib/integrations/slack/ops-triggers";

export type SelfServiceDeletionContext = {
  userId: string;
  role: string;
  email: string | null;
  tenantId: string;
  providerId: string | null;
  snapshot: UserPurgeSnapshot | null;
};

function complianceAuditReason(reason: string | null | undefined): string {
  const base = (reason?.trim() || "No reason provided by user.").slice(0, 500);
  const padded =
    base.length >= 20
      ? base
      : `Self-service permanent account deletion. ${base}`.slice(0, 500);
  return padded.length >= 20 ? padded : `${padded} (user-initiated)`.padEnd(20, ".");
}

async function resolveTenantIdForDeletion(
  admin: SupabaseClient,
  userId: string,
  role: string,
): Promise<string> {
  const { data: u } = await admin
    .from("users")
    .select("preferred_home_tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const home = (u as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id;
  if (home) return home;

  if (role === "provider_owner") {
    const { data: prov } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (prov?.tenant_id) return prov.tenant_id as string;
  }

  if (role === "provider_staff") {
    const { data: staff } = await admin
      .from("provider_staff")
      .select("provider_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (staff?.provider_id) {
      const { data: prov } = await admin
        .from("providers")
        .select("tenant_id")
        .eq("id", staff.provider_id)
        .maybeSingle();
      if (prov?.tenant_id) return prov.tenant_id as string;
    }
  }

  return "platform";
}

async function resolveProviderId(
  admin: SupabaseClient,
  userId: string,
  role: string,
): Promise<string | null> {
  if (role === "provider_owner") {
    const { data: prov } = await admin
      .from("providers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return (prov?.id as string | undefined) ?? null;
  }
  if (role === "provider_staff") {
    const { data: staff } = await admin
      .from("provider_staff")
      .select("provider_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    return (staff?.provider_id as string | undefined) ?? null;
  }
  return null;
}

/** Load profile snapshot and routing context while the user row still exists. */
export async function loadSelfServiceDeletionContext(
  admin: SupabaseClient,
  params: { userId: string; role: string; authEmail?: string | null },
): Promise<SelfServiceDeletionContext> {
  const snapshot = await collectUserPurgeSnapshot(admin, params.userId);
  const tenantId = await resolveTenantIdForDeletion(admin, params.userId, params.role);
  const providerId = await resolveProviderId(admin, params.userId, params.role);

  return {
    userId: params.userId,
    role: params.role,
    email: snapshot?.email ?? params.authEmail ?? null,
    tenantId,
    providerId,
    snapshot,
  };
}

/**
 * Best-effort ops notification: Slack (when routed), platform audit_logs, and
 * compliance_purge_audit_log for the admin Compliance UI.
 */
export async function notifyOpsSelfServiceAccountDeletion(
  admin: SupabaseClient,
  params: {
    request: NextRequest;
    outcome: "succeeded" | "failed";
    context: SelfServiceDeletionContext;
    reason?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    preUpdateFailed?: boolean;
    storageAttachmentsRemoved?: number;
  },
): Promise<void> {
  const { context } = params;
  const reqMeta = extractRequestMeta(params.request);
  const auditReason = complianceAuditReason(params.reason);

  if (params.outcome === "succeeded") {
    slackNotifySelfServiceAccountDeletionSucceeded({
      tenantId: context.tenantId,
      userId: context.userId,
      role: context.role,
      email: context.email,
      providerId: context.providerId,
      reason: params.reason,
    });

    const completedAt = new Date().toISOString();
    const report: CompliancePurgeReportV2 = {
      schema_version: 3,
      purge_type: "user",
      started_at: completedAt,
      completed_at: completedAt,
      safeguards: {
        confirmation_phrase_verified: true,
        target_email_match_verified: false,
        regulatory_acknowledgement: true,
        reason_min_length_met: auditReason.trim().length >= 20,
      },
      actor: { user_id: context.userId, role: context.role },
      tenant_id: context.tenantId === "platform" ? null : context.tenantId,
      reason_redacted_length: (params.reason?.trim() || "").length,
      operations: {
        compliance_clear_user_references_rpc: true,
        message_attachment_storage_objects_removed: params.storageAttachmentsRemoved ?? 0,
        auth_users_deleted: [context.userId],
      },
      snapshot: context.snapshot ? redactUserPurgeSnapshot(context.snapshot) : null,
    };

    const auditInsert = await insertCompliancePurgeAuditLog(admin, {
      actor_user_id: null,
      tenant_id: context.tenantId === "platform" ? null : context.tenantId,
      purge_type: "user",
      target_user_id: context.userId,
      provider_id: context.providerId,
      reason: auditReason,
      report,
      purged_user_ids: [context.userId],
    });

    if (auditInsert.ok === false) {
      console.warn("[delete-account] compliance_purge_audit_log write failed:", auditInsert.error);
    }

    await writeAuditLog({
      actor_user_id: context.userId,
      actor_role: context.role,
      action: "user.account.self_service_delete",
      entity_type: "user",
      entity_id: context.userId,
      module: "users_trust",
      risk_level: context.role === "provider_owner" ? "critical" : "high",
      status: "succeeded",
      reason: params.reason ?? undefined,
      metadata: {
        purge_type: "user_self_service",
        provider_id: context.providerId,
        compliance_audit_id: auditInsert.ok ? auditInsert.id : null,
        compliance_audit_write_error: auditInsert.ok === false ? auditInsert.error : null,
        email: context.email,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });
    return;
  }

  slackNotifySelfServiceAccountDeletionFailed({
    tenantId: context.tenantId,
    userId: context.userId,
    role: context.role,
    email: context.email,
    providerId: context.providerId,
    failureCode: params.failureCode,
    failureMessage: params.failureMessage,
    preUpdateFailed: params.preUpdateFailed,
  });

  await writeAuditLog({
    actor_user_id: context.userId,
    actor_role: context.role,
    action: "user.account.self_service_delete",
    entity_type: "user",
    entity_id: context.userId,
    module: "users_trust",
    risk_level: context.role === "provider_owner" ? "critical" : "high",
    status: "failed",
    reason: params.failureMessage ?? params.failureCode ?? undefined,
    metadata: {
      purge_type: "user_self_service",
      provider_id: context.providerId,
      failure_code: params.failureCode,
      pre_update_failed: params.preUpdateFailed ?? false,
      email: context.email,
    },
    ip_address: reqMeta.ip_address,
    user_agent: reqMeta.user_agent,
    retention_tier: "access",
  });
}
