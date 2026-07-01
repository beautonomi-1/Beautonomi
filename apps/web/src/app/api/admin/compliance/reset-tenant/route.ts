import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  insertCompliancePurgeAuditLog,
  type CompliancePurgeReportV2,
} from "@/lib/account/compliance-purge-audit";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * POST /api/admin/compliance/reset-tenant
 *
 * Superadmin-only "clean slate" for a tenant's transactional + derived/activity data: bookings (and
 * children), payments, orders, ledger/journal entries, reviews, conversations, support tickets,
 * notifications, provider gamification, group bookings, explore posts, waitlist, ad campaigns,
 * payouts, provider invoices, recurring appointments, VAT reminders, payment webhook events,
 * promotion usage, gift-card/loyalty redemptions, and the booking-linked loyalty ledger.
 *
 * Then it RECOMPUTES cached aggregates from the surviving rows: provider rating/review_count/
 * total_bookings/total_paid_out/current_badge_id, and user_wallets.balance (recomputed from remaining
 * wallet_transactions — multi-tenant safe, never blind-zeroed).
 *
 * Explicitly preserves the structural spine (users, providers, services, products, badge/coupon/
 * loyalty config, platform settings, tenant config) and cross-tenant user-global rows that cannot be
 * attributed to a single tenant (referrals, user_coupons, loyalty milestone awards, non-booking
 * loyalty, global webhooks). For full user erasure use `/api/admin/compliance/purge-user` instead.
 *
 * Reliability: the DB function isolates each table/recompute (a missing table/column or RESTRICT FK
 * is reported in `counts` as `{skipped:"error", error:…}` and skipped, never aborting the whole
 * reset). It is idempotent, so a partial run can be re-executed. Dry-run mutates nothing.
 *
 * Flow:
 *   1) Superadmin gate (role check).
 *   2) Multi-field confirmation: reason ≥ 20 chars, phrase `RESET TENANT TRANSACTIONS`,
 *      tenant slug typed back, `acknowledge_irreversible: true`.
 *   3) Default ZA tenant is refused unless `allow_default_tenant: true` is also passed — prevents
 *      the whole production tenant from being wiped by a fat-finger tenant_id.
 *   4) DB function `compliance_reset_tenant_transactions` runs in dry-run or live mode. Dry-run
 *      returns counts only; live mode deletes and returns post-delete counts.
 *   5) On live runs, we insert an immutable `compliance_purge_audit_log` row with the per-table
 *      report so the action is auditable.
 */
const bodySchema = z.object({
  tenant_id: z.string().uuid(),
  /** Tenant slug typed back by the operator — must match `tenants.slug` for the target tenant. */
  tenant_slug_confirmation: z.string().min(1).max(120),
  reason: z
    .string()
    .min(20, "Reason must be at least 20 characters (regulatory / audit requirement)")
    .max(5000),
  confirmation_phrase: z.literal("RESET TENANT TRANSACTIONS"),
  acknowledge_irreversible: z.literal(true),
  /** When true, runs the function in dry-run mode (returns counts; no rows deleted). */
  dry_run: z.boolean().default(false),
  /** Required + true before the default ZA tenant can be reset. */
  allow_default_tenant: z.boolean().default(false),
});

type ResetFnResult = {
  tenant_id: string;
  tenant_slug: string;
  dry_run: boolean;
  started_at: string;
  completed_at: string;
  counts: Record<string, { rows?: number; via?: string; skipped?: string }>;
};

export async function POST(request: NextRequest) {
  try {
    const { user: actor } = await requireRoleInApi(["superadmin"], request);
    const actingTenantId = await resolveAdminApiTenantId(request);
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        {
          data: null,
          error: {
            message: "Invalid reset-tenant request",
            code: "VALIDATION_ERROR",
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const {
      tenant_id,
      tenant_slug_confirmation,
      reason,
      dry_run,
      allow_default_tenant,
    } = parsed.data;

    const admin = getSupabaseAdmin();

    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, slug, name")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return Response.json(
        {
          data: null,
          error: { message: "Tenant not found", code: "TENANT_NOT_FOUND" },
        },
        { status: 404 },
      );
    }

    if ((tenant.slug ?? "").trim().toLowerCase() !== tenant_slug_confirmation.trim().toLowerCase()) {
      return Response.json(
        {
          data: null,
          error: {
            message: "tenant_slug_confirmation must match the tenant's slug exactly",
            code: "SLUG_CONFIRMATION_MISMATCH",
          },
        },
        { status: 400 },
      );
    }

    const startedAt = new Date().toISOString();
    const { data: rpcData, error: rpcError } = await admin.rpc(
      "compliance_reset_tenant_transactions",
      {
        p_tenant_id: tenant_id,
        p_dry_run: dry_run,
        p_allow_default_tenant: allow_default_tenant,
      },
    );

    if (rpcError) {
      const msg = rpcError.message || "Failed to run tenant reset";
      const isDefaultTenantGuard = /default ZA tenant/i.test(msg);
      return Response.json(
        {
          data: null,
          error: {
            message: msg,
            code: isDefaultTenantGuard ? "DEFAULT_TENANT_BLOCKED" : "RPC_ERROR",
          },
        },
        { status: isDefaultTenantGuard ? 409 : 500 },
      );
    }

    const result = rpcData as ResetFnResult | null;
    if (!result) {
      return Response.json(
        {
          data: null,
          error: {
            message: "Tenant reset returned no result",
            code: "RPC_EMPTY_RESULT",
          },
        },
        { status: 500 },
      );
    }

    const completedAt = new Date().toISOString();

    const report: CompliancePurgeReportV2 = {
      schema_version: 2,
      purge_type: "tenant_reset",
      started_at: startedAt,
      completed_at: completedAt,
      safeguards: {
        confirmation_phrase_verified: true,
        target_email_match_verified: true, // tenant_slug match plays the same role here
        regulatory_acknowledgement: true,
        reason_min_length_met: reason.trim().length >= 20,
      },
      actor: { user_id: actor.id, role: actor.role },
      tenant_id: actingTenantId,
      reason_redacted_length: reason.trim().length,
      operations: {
        compliance_clear_user_references_rpc: false,
        message_attachment_storage_objects_removed: 0,
        auth_users_deleted: [],
        tenant_reset_counts: result.counts,
        tenant_reset_dry_run: dry_run,
        tenant_reset_allowed_default_tenant: allow_default_tenant,
      },
      snapshot: {
        tenant_id: result.tenant_id,
        tenant_slug: result.tenant_slug,
        target_tenant_name: tenant.name ?? null,
      },
    };

    // Only write the immutable audit row for *live* runs; dry-runs are diagnostic and should not
    // clutter the compliance log.
    let complianceAuditId: string | null = null;
    let complianceAuditError: string | null = null;
    let complianceAuditDegraded = false;
    if (!dry_run) {
      const auditInsert = await insertCompliancePurgeAuditLog(admin, {
        actor_user_id: actor.id,
        tenant_id: tenant_id, // the *target* tenant for this audit row
        purge_type: "tenant_reset",
        target_user_id: null,
        provider_id: null,
        reason,
        report,
        purged_user_ids: [],
      });
      if (auditInsert.ok === true) {
        complianceAuditId = auditInsert.id;
        complianceAuditDegraded = auditInsert.degraded === true;
      } else {
        complianceAuditError = auditInsert.error;
      }

      await writeAuditLog({
        actor_user_id: actor.id,
        actor_role: actor.role ?? "superadmin",
        action: "admin.tenant.transactional_reset",
        entity_type: "tenant",
        entity_id: tenant_id,
        metadata: {
          tenant_slug: result.tenant_slug,
          total_tables: Object.keys(result.counts).length,
          total_rows: Object.values(result.counts).reduce(
            (sum, entry) => sum + (typeof entry.rows === "number" ? entry.rows : 0),
            0,
          ),
          compliance_audit_row: complianceAuditId
            ? { id: complianceAuditId, degraded: complianceAuditDegraded || undefined }
            : { error: complianceAuditError },
        },
      });
    }

    return successResponse({
      tenant_id: result.tenant_id,
      tenant_slug: result.tenant_slug,
      dry_run,
      compliance_audit_id: complianceAuditId,
      compliance_audit_write_error: complianceAuditError,
      compliance_audit_degraded: complianceAuditDegraded || null,
      report,
      counts: result.counts,
      totals: {
        tables: Object.keys(result.counts).length,
        rows: Object.values(result.counts).reduce(
          (sum, entry) => sum + (typeof entry.rows === "number" ? entry.rows : 0),
          0,
        ),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to reset tenant transactional data");
  }
}
