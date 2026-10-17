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
    const body = (await request.json().catch(() => ({}))) as {
      transfer_reference?: string;
      notes?: string;
    };
    const transferReference = (body.transfer_reference ?? "").trim();
    if (!transferReference) {
      return errorResponse("Bank transfer reference is required", "REFERENCE_REQUIRED", 400);
    }

    const { data: row } = await supabase
      .from("wallet_bank_refund_requests")
      .select("id, tenant_id, request_number, amount, net_amount, currency")
      .eq("id", id)
      .maybeSingle();
    if (!row || row.tenant_id !== tenantId) {
      return notFoundResponse("Request not found");
    }

    const lockGuard = await enforcePeriodLock(supabase, tenantId, new Date().toISOString());
    if (lockGuard) return lockGuard;

    const { data, error } = await supabase.rpc("wallet_bank_refund_mark_paid", {
      p_request_id: id,
      p_admin_user_id: user.id,
      p_transfer_reference: transferReference,
      p_notes: body.notes ?? null,
    });
    if (error) {
      if ((error.message || "").includes("REQUEST_NOT_APPROVED")) {
        return errorResponse("Approve the request before marking it paid.", "INVALID_STATE", 400);
      }
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "wallet_bank_refund_mark_paid",
      entity_type: "wallet_bank_refund_request",
      entity_id: id,
      retention_tier: "financial",
      metadata: {
        request_number: row.request_number,
        transfer_reference: transferReference,
        amount: row.amount,
        net_amount: row.net_amount,
        currency: row.currency,
      },
    });

    const updated = (data as { request?: Record<string, unknown> })?.request;
    if (updated) await notifyWalletBankRefund("paid", updated as never);
    return successResponse({ request: updated ? serializeWalletBankRefundRequest(updated) : null });
  } catch (error) {
    return handleApiError(error, "Failed to mark wallet bank refund paid");
  }
}
