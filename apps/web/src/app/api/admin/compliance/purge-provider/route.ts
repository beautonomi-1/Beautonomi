import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { purgeProviderOrganizationFully } from "@/lib/account/purge-platform-user";
import {
  collectProviderOrgPurgeSnapshot,
  collectUserPurgeSnapshot,
} from "@/lib/account/compliance-purge-snapshot";
import {
  insertCompliancePurgeAuditLog,
  type CompliancePurgeReportV2,
} from "@/lib/account/compliance-purge-audit";
import { writeAuditLog } from "@/lib/audit/audit";
import { invalidatePublicProviderCache } from "@/lib/providers/invalidate-public-provider-cache";

const bodySchema = z.object({
  provider_id: z.string().uuid(),
  reason: z
    .string()
    .min(20, "Reason must be at least 20 characters (regulatory / audit requirement)")
    .max(5000),
  confirmation_phrase: z.literal("PURGE PROVIDER ORG"),
  /** Must match the provider business email or the owner account email (case-insensitive). */
  typed_email_confirmation: z.string().min(3).max(320),
  acknowledge_irreversible: z.literal(true),
});

function normalizeEmail(e: string): string {
  return e
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function uniqueNonEmptyEmails(emails: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of emails) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!t) continue;
    const key = normalizeEmail(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * POST /api/admin/compliance/purge-provider
 *
 * Superadmin only. Multi-step confirmation + reason + immutable audit row + structured report.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: actor } = await requireRoleInApi(["superadmin"], request);
    const tenantId = await resolveAdminApiTenantId(request);
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        {
          data: null,
          error: {
            message: "Invalid purge request",
            code: "VALIDATION_ERROR",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const { provider_id, reason, typed_email_confirmation } = parsed.data;
    const admin = getSupabaseAdmin();

    const orgSnap = await collectProviderOrgPurgeSnapshot(admin, {
      providerId: provider_id,
      tenantId,
    });

    if (!orgSnap) {
      return notFoundResponse("Provider not found");
    }

    const ownerId = orgSnap.owner_user_id;
    if (!ownerId) {
      return Response.json(
        { data: null, error: { message: "Provider has no owner user", code: "INVALID_PROVIDER" } },
        { status: 400 },
      );
    }

    const { data: ownerRow } = await admin.from("users").select("role").eq("id", ownerId).maybeSingle();
    if (ownerRow?.role === "superadmin") {
      return Response.json(
        { data: null, error: { message: "Refusing to purge a superadmin-owned provider", code: "PERMISSION_DENIED" } },
        { status: 403 },
      );
    }

    let allowedEmails = uniqueNonEmptyEmails([
      orgSnap.provider_email,
      orgSnap.provider_billing_email,
      orgSnap.owner_email,
    ]);

    if (ownerId) {
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(ownerId);
      if (!authErr && authUser?.user?.email?.trim()) {
        allowedEmails = uniqueNonEmptyEmails([...allowedEmails, authUser.user.email.trim()]);
      }
    }

    if (allowedEmails.length === 0) {
      return Response.json(
        {
          data: null,
          error: {
            message:
              "No confirmation email on file for this provider (business, billing, owner profile, and Auth are empty). Set an email or use another verification path before purge.",
            code: "NO_CONFIRM_EMAIL",
          },
        },
        { status: 400 },
      );
    }

    const typed = normalizeEmail(typed_email_confirmation);
    const emailOk = allowedEmails.some((e) => normalizeEmail(e) === typed);
    if (!emailOk) {
      return Response.json(
        {
          data: null,
          error: {
            message: `typed_email_confirmation must match one of: ${allowedEmails.join(", ")}`,
            code: "EMAIL_CONFIRMATION_MISMATCH",
            accepted_emails: allowedEmails,
          },
        },
        { status: 400 },
      );
    }

    const staffIds = [...new Set(orgSnap.staff_login_user_ids)].filter((id) => id !== ownerId);

    const perUserSnapshots: NonNullable<CompliancePurgeReportV2["per_user_snapshots"]> = [];
    for (const sid of staffIds) {
      const s = await collectUserPurgeSnapshot(admin, sid);
      if (s) perUserSnapshots.push(s);
    }
    const ownerSnap = await collectUserPurgeSnapshot(admin, ownerId);
    if (ownerSnap) perUserSnapshots.push(ownerSnap);

    const startedAt = new Date().toISOString();
    const result = await purgeProviderOrganizationFully(admin, {
      providerId: provider_id,
      tenantId,
    });

    if (result.ok === false) {
      return Response.json(
        {
          data: null,
          error: { message: result.message, code: result.code ?? "PURGE_FAILED" },
        },
        { status: 500 },
      );
    }

    const completedAt = new Date().toISOString();

    const report: CompliancePurgeReportV2 = {
      schema_version: 2,
      purge_type: "provider_org",
      started_at: startedAt,
      completed_at: completedAt,
      safeguards: {
        confirmation_phrase_verified: true,
        target_email_match_verified: true,
        regulatory_acknowledgement: true,
        reason_min_length_met: reason.trim().length >= 20,
      },
      actor: { user_id: actor.id, role: actor.role },
      tenant_id: tenantId,
      reason_redacted_length: reason.trim().length,
      operations: {
        compliance_clear_user_references_rpc: true,
        message_attachment_storage_objects_removed: result.storage_attachments_removed_total,
        auth_users_deleted: result.purged_user_ids,
      },
      snapshot: orgSnap,
      per_user_snapshots: perUserSnapshots,
    };

    const auditInsert = await insertCompliancePurgeAuditLog(admin, {
      actor_user_id: actor.id,
      tenant_id: tenantId,
      purge_type: "provider_org",
      target_user_id: ownerId,
      provider_id: provider_id,
      reason,
      report,
      purged_user_ids: result.purged_user_ids,
    });

    await writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? "superadmin",
      action: "admin.provider.compliance_purge",
      entity_type: "provider",
      entity_id: provider_id,
      metadata: {
        purged_user_ids: result.purged_user_ids,
        compliance_audit_row:
          auditInsert.ok === true ? { id: auditInsert.id } : { error: auditInsert.error },
      },
    });

    invalidatePublicProviderCache();

    return successResponse({
      provider_id,
      purged_user_ids: result.purged_user_ids,
      compliance_audit_id: auditInsert.ok === true ? auditInsert.id : null,
      compliance_audit_write_error: auditInsert.ok === true ? null : auditInsert.error,
      report,
    });
  } catch (error) {
    return handleApiError(error, "Failed to purge provider");
  }
}
