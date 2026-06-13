import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { purgePlatformUserAccountFully } from "@/lib/account/purge-platform-user";
import { collectUserPurgeSnapshot } from "@/lib/account/compliance-purge-snapshot";
import {
  insertCompliancePurgeAuditLog,
  type CompliancePurgeReportV2,
} from "@/lib/account/compliance-purge-audit";
import { writeAuditLog } from "@/lib/audit/audit";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  reason: z
    .string()
    .min(20, "Reason must be at least 20 characters (regulatory / audit requirement)")
    .max(5000),
  confirmation_phrase: z.literal("DELETE USER FOREVER"),
  /** Must match the account email exactly (case-insensitive). */
  target_email_confirmation: z.string().min(3).max(320),
  acknowledge_irreversible: z.literal(true),
});

function normalizeEmail(e: string): string {
  return e
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * POST /api/admin/compliance/purge-user
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

    const { user_id, reason, target_email_confirmation } = parsed.data;
    const admin = getSupabaseAdmin();

    const { data: userRow, error: fetchError } = await admin
      .from("users")
      .select("id, email, role")
      .eq("id", user_id)
      .maybeSingle();

    if (fetchError) {
      return handleApiError(fetchError, "Failed to load user");
    }

    let existingUser: { id: string; email: string | null; role: string | null } | null = userRow;
    if (!existingUser) {
      const { data: authRow, error: authLookupErr } = await admin.auth.admin.getUserById(user_id);
      if (authLookupErr || !authRow?.user) {
        return notFoundResponse("User not found");
      }
      existingUser = {
        id: authRow.user.id,
        email: authRow.user.email ?? null,
        role: null,
      };
    }

    if (user_id === actor.id) {
      return Response.json(
        { data: null, error: { message: "Cannot purge your own account", code: "PERMISSION_DENIED" } },
        { status: 403 },
      );
    }

    if (existingUser.role === "superadmin") {
      return Response.json(
        { data: null, error: { message: "Cannot purge another superadmin account", code: "PERMISSION_DENIED" } },
        { status: 403 },
      );
    }

    let accountEmail = typeof existingUser.email === "string" ? existingUser.email.trim() : "";
    if (!accountEmail) {
      const { data: authRow, error: authLookupErr } = await admin.auth.admin.getUserById(user_id);
      if (authLookupErr) {
        console.warn("[purge-user] auth.admin.getUserById:", authLookupErr.message);
      }
      accountEmail = (authRow?.user?.email ?? "").trim();
    }

    if (!accountEmail) {
      return Response.json(
        {
          data: null,
          error: {
            message:
              "This account has no email on file (users.email and Auth email are empty). Use another verification process or set an email before purge.",
            code: "NO_ACCOUNT_EMAIL",
          },
        },
        { status: 400 },
      );
    }

    if (normalizeEmail(target_email_confirmation) !== normalizeEmail(accountEmail)) {
      return Response.json(
        {
          data: null,
          error: {
            message: `target_email_confirmation must match the account email (case-insensitive). Expected: ${accountEmail}`,
            code: "EMAIL_CONFIRMATION_MISMATCH",
          },
        },
        { status: 400 },
      );
    }

    const snapshot = await collectUserPurgeSnapshot(admin, user_id);
    if (!snapshot) {
      return Response.json(
        { data: null, error: { message: "Could not load user snapshot for purge report", code: "SNAPSHOT_FAILED" } },
        { status: 500 },
      );
    }

    const startedAt = new Date().toISOString();
    const purgeResult = await purgePlatformUserAccountFully(admin, user_id);

    if (purgeResult.ok === false) {
      console.error("Compliance purge failed:", purgeResult.message);
      return Response.json(
        {
          data: null,
          error: {
            message: purgeResult.message || "Failed to purge user",
            code: purgeResult.code ?? "DELETE_ERROR",
            details:
              purgeResult.blockers && purgeResult.blockers.length > 0
                ? { blockers: purgeResult.blockers }
                : undefined,
          },
        },
        { status: 500 },
      );
    }

    const completedAt = new Date().toISOString();

    const report: CompliancePurgeReportV2 = {
      schema_version: 2,
      purge_type: "user",
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
        message_attachment_storage_objects_removed: purgeResult.storage_attachments_removed,
        auth_users_deleted: [user_id],
      },
      snapshot,
    };

    const auditInsert = await insertCompliancePurgeAuditLog(admin, {
      actor_user_id: actor.id,
      tenant_id: tenantId,
      purge_type: "user",
      target_user_id: user_id,
      provider_id: null,
      reason,
      report,
      purged_user_ids: [user_id],
    });

    await writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? "superadmin",
      action: "admin.user.compliance_purge",
      entity_type: "user",
      entity_id: user_id,
      metadata: {
        email: snapshot.email,
        compliance_audit_row:
          auditInsert.ok === true ? { id: auditInsert.id } : { error: auditInsert.error },
      },
    });

    return successResponse({
      purged_user_id: user_id,
      compliance_audit_id: auditInsert.ok === true ? auditInsert.id : null,
      compliance_audit_write_error: auditInsert.ok === true ? null : auditInsert.error,
      report,
    });
  } catch (error) {
    return handleApiError(error, "Failed to purge user");
  }
}
