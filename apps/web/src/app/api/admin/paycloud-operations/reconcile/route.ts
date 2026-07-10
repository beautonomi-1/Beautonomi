import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { reconcilePaycloudPaymentsBatch } from "@/lib/payments/paycloud-reconcile";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * POST /api/admin/paycloud-operations/reconcile
 * Run PayCloud reconciliation for pending/processing payments (last 24h).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from("provider_paycloud_payments")
      .select(
        "id, provider_id, terminal_id, merchant_order_no, paycloud_order_id, amount, expected_amount, currency, status, entity_type, entity_id, processed_by, trans_status, metadata, created_at",
      )
      .in("status", ["pending", "processing"])
      .gte("created_at", since);
    if (tenantId) {
      q = q.eq("tenant_id", tenantId);
    }

    const { data: pending, error } = await q;
    if (error) throw error;

    const payments = pending ?? [];
    const result = await reconcilePaycloudPaymentsBatch({ supabase, payments });

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.paycloud.reconcile.run",
      entity_type: "provider_paycloud_payments",
      entity_id: null,
      metadata: { payment_count: payments.length, result, tenant_id: tenantId },
    });

    return successResponse({ payment_count: payments.length, result });
  } catch (error) {
    return handleApiError(error, "Failed to run PayCloud reconciliation");
  }
}
