import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYCLOUD_TRANS_TYPE } from "@/lib/payments/paycloud";
import {
  reversePaycloudSettlement,
  type PaycloudEntityType,
} from "@/lib/payments/settle-paycloud-payment";

type PaycloudPaymentLike = {
  id: string;
  provider_id: string;
  entity_type: string;
  entity_id: string;
  merchant_order_no: string;
  paycloud_order_id?: string | null;
  trans_type?: number | null;
  amount?: number | null;
  processed_by?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * A PayCloud payment row represents a REFUND (reversal) rather than a fresh capture.
 */
export function isPaycloudRefundRow(payment: PaycloudPaymentLike | null | undefined): boolean {
  if (!payment) return false;
  if (Number(payment.trans_type) === PAYCLOUD_TRANS_TYPE.REFUND) return true;
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  return Boolean(meta.refund_of_payment_id);
}

/**
 * Finalize a completed PayCloud REFUND: reverse the original capture rather than
 * settling the refund as a new positive payment. Idempotent from webhook/poller.
 */
export async function completePaycloudRefund(
  supabase: SupabaseClient,
  refundPayment: PaycloudPaymentLike,
): Promise<{ reversed: boolean; reason?: string }> {
  const meta = (refundPayment.metadata ?? {}) as Record<string, unknown>;
  const origId =
    typeof meta.refund_of_payment_id === "string" ? (meta.refund_of_payment_id as string) : null;

  let origPayment: {
    id: string;
    paycloud_order_id?: string | null;
    merchant_order_no?: string | null;
    status?: string | null;
  } | null = null;

  if (origId) {
    const { data } = await supabase
      .from("provider_paycloud_payments")
      .select("id, paycloud_order_id, merchant_order_no, status")
      .eq("id", origId)
      .maybeSingle();
    origPayment = data;
  }

  const origProviderPaymentId =
    origPayment?.paycloud_order_id ||
    origPayment?.merchant_order_no ||
    (typeof meta.orig_paycloud_order_id === "string" ? (meta.orig_paycloud_order_id as string) : "") ||
    (typeof meta.orig_merchant_order_no === "string" ? (meta.orig_merchant_order_no as string) : "");

  const refundReference = refundPayment.paycloud_order_id || refundPayment.merchant_order_no;

  return reversePaycloudSettlement(supabase, {
    entityType: refundPayment.entity_type as PaycloudEntityType,
    entityId: refundPayment.entity_id,
    providerId: refundPayment.provider_id,
    origProviderPaymentId,
    voidReference: refundReference,
    processedBy: refundPayment.processed_by,
    refundAmount: Math.max(0, Number(refundPayment.amount ?? 0)),
    reversalKind: "refund",
  });
}
