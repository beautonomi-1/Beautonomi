import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog } from "@/lib/audit/audit";
import { settlePaycloudPayment, type PaycloudEntityType } from "@/lib/payments/settle-paycloud-payment";
import { PAYCLOUD_TRANS_STATUS } from "@/lib/payments/paycloud";
import { resolvePaycloudCapturedAmount } from "@/lib/payments/paycloud-cloud-amount";

const SETTLEABLE_ENTITY_TYPES = new Set<PaycloudEntityType>([
  "booking",
  "group_booking",
  "sale",
  "product_order",
  "additional_charge",
]);

/**
 * POST /api/admin/paycloud-operations/payments/[id]/force-settle
 *
 * Superadmin manual settlement for successful PayCloud captures that did not
 * auto-settle (e.g. amount mismatch exceptions). Requires local status=successful
 * and trans_status=2 (completed capture). Always clears terminal in_flight for
 * this payment so amount-mismatch rows cannot leave the machine stuck.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: payment, error: paymentError } = await supabase
      .from("provider_paycloud_payments")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return notFoundResponse("PayCloud payment not found");

    if (payment.status !== "successful") {
      return errorResponse(
        "Only successful PayCloud payments can be force-settled.",
        "INVALID_STATUS",
        409,
      );
    }

    if (String(payment.trans_status ?? "") !== PAYCLOUD_TRANS_STATUS.COMPLETED) {
      return errorResponse(
        "Force-settle requires a completed PayCloud capture (trans_status=2).",
        "TRANS_STATUS_NOT_COMPLETED",
        409,
      );
    }

    const entityType = payment.entity_type as PaycloudEntityType;
    if (!SETTLEABLE_ENTITY_TYPES.has(entityType)) {
      return errorResponse(
        `Unsupported entity type for settlement: ${payment.entity_type}`,
        "UNSUPPORTED_ENTITY",
        400,
      );
    }

    const captured = resolvePaycloudCapturedAmount(payment);
    if (!Number.isFinite(captured) || captured <= 0) {
      return errorResponse("Payment amount is missing or invalid.", "VALIDATION_ERROR", 400);
    }

    if (
      (payment.amount_match_status === "under" || payment.amount_match_status === "mismatch") &&
      !(payment.metadata as { captured_amount?: number } | null)?.captured_amount
    ) {
      return errorResponse(
        "Cannot force-settle without a recorded terminal capture amount. Reconcile the payment first.",
        "MISSING_CAPTURED_AMOUNT",
        409,
      );
    }

    const result = await settlePaycloudPayment(supabase, {
      paymentId: payment.id,
      providerId: payment.provider_id,
      entityType,
      entityId: payment.entity_id,
      amount: captured,
      paycloudOrderId: payment.paycloud_order_id ?? payment.merchant_order_no,
      merchantOrderNo: payment.merchant_order_no,
      processedBy: user.id,
      currency: payment.currency,
      tipAmount: Number(payment.tip_amount ?? 0),
      cashbackAmount: Number(payment.cashback_amount ?? 0),
      expectedBaseAmount: Number(payment.expected_amount ?? payment.amount ?? 0),
    });

    if (payment.terminal_id) {
      await supabase
        .from("paycloud_terminals")
        .update({
          in_flight_payment_id: null,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", payment.terminal_id)
        .eq("in_flight_payment_id", payment.id);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.paycloud.payments.force_settle",
      entity_type: "provider_paycloud_payments",
      entity_id: payment.id,
      metadata: {
        provider_id: payment.provider_id,
        merchant_order_no: payment.merchant_order_no,
        amount_match_status: payment.amount_match_status,
        trans_status: payment.trans_status,
        settled: result.settled,
        reason: result.reason ?? null,
      },
    });

    return successResponse({
      payment_id: payment.id,
      settled: result.settled,
      reason: result.reason ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to force-settle PayCloud payment");
  }
}
