import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { serializeWalletBankRefundRequest } from "@/lib/wallet-bank-refunds/serialize";
import { notifyWalletBankRefund } from "@/lib/wallet-bank-refunds/notify";
import { enforcePeriodLock } from "@/lib/finance/period-lock";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as { notes?: string };

    const { data: row } = await supabase
      .from("wallet_bank_refund_requests")
      .select("id, tenant_id, request_number, amount, net_amount, currency, user_id")
      .eq("id", id)
      .maybeSingle();
    if (!row || row.tenant_id !== tenantId) {
      return notFoundResponse("Request not found");
    }

    const lockGuard = await enforcePeriodLock(supabase, tenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    const { data, error } = await supabase.rpc("wallet_bank_refund_approve", {
      p_request_id: id,
      p_admin_user_id: user.id,
      p_admin_notes: body.notes ?? null,
    });
    if (error) {
      if ((error.message || "").includes("REQUEST_NOT_PENDING")) {
        return errorResponse("Only pending requests can be approved.", "INVALID_STATE", 400);
      }
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "wallet_bank_refund_approve",
      entity_type: "wallet_bank_refund_request",
      entity_id: id,
      retention_tier: "financial",
      metadata: {
        request_number: row.request_number,
        amount: row.amount,
        net_amount: row.net_amount,
        currency: row.currency,
        customer_user_id: row.user_id,
      },
    });

    const updated = (data as { request?: Record<string, unknown> })?.request;
    if (updated) await notifyWalletBankRefund("approved", updated as never);
    return successResponse({ request: updated ? serializeWalletBankRefundRequest(updated) : null });
  } catch (error) {
    return handleApiError(error, "Failed to approve wallet bank refund");
  }
}
