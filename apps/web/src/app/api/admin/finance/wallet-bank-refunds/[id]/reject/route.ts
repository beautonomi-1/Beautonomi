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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = (body.reason ?? "").trim();
    if (!reason) {
      return errorResponse("Rejection reason is required", "REASON_REQUIRED", 400);
    }

    const { data: row } = await supabase
      .from("wallet_bank_refund_requests")
      .select("id, tenant_id, request_number, amount, currency")
      .eq("id", id)
      .maybeSingle();
    if (!row || row.tenant_id !== tenantId) {
      return notFoundResponse("Request not found");
    }

    const { data, error } = await supabase.rpc("wallet_bank_refund_reject", {
      p_request_id: id,
      p_admin_user_id: user.id,
      p_reason: reason,
    });
    if (error) {
      if ((error.message || "").includes("REQUEST_NOT_OPEN")) {
        return errorResponse("Only pending or approved requests can be rejected.", "INVALID_STATE", 400);
      }
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "wallet_bank_refund_reject",
      entity_type: "wallet_bank_refund_request",
      entity_id: id,
      retention_tier: "financial",
      metadata: { request_number: row.request_number, amount: row.amount, currency: row.currency, reason },
    });

    const updated = (data as { request?: Record<string, unknown> })?.request;
    if (updated) await notifyWalletBankRefund("rejected", updated as never);
    return successResponse({ request: updated ? serializeWalletBankRefundRequest(updated) : null });
  } catch (error) {
    return handleApiError(error, "Failed to reject wallet bank refund");
  }
}
