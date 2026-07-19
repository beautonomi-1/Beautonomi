import type { SupabaseClient } from "@supabase/supabase-js";
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
  processed_by?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * A PayCloud payment row represents a VOID (reversal) rather than a fresh capture.
 * Void rows are created with trans_type=2 (VOID) and carry `void_of_payment_id` in
 * metadata pointing at the original successful capture.
 */
export function isPaycloudVoidRow(payment: PaycloudPaymentLike | null | undefined): boolean {
  if (!payment) return false;
  if (Number(payment.trans_type) === 2) return true;
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  return Boolean(meta.void_of_payment_id);
}

/**
 * Finalize a completed PayCloud VOID: reverse the original capture (never settle the
 * void as a new positive payment) and mark the original payment cancelled.
 * Idempotent — safe to call from both the webhook and the reconcile poller.
 */
export async function completePaycloudVoid(
  supabase: SupabaseClient,
  voidPayment: PaycloudPaymentLike,
): Promise<{ reversed: boolean; reason?: string }> {
  const meta = (voidPayment.metadata ?? {}) as Record<string, unknown>;
  const origId =
    typeof meta.void_of_payment_id === "string" ? (meta.void_of_payment_id as string) : null;

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

  const voidReference = voidPayment.paycloud_order_id || voidPayment.merchant_order_no;

  const reversal = await reversePaycloudSettlement(supabase, {
    entityType: voidPayment.entity_type as PaycloudEntityType,
    entityId: voidPayment.entity_id,
    providerId: voidPayment.provider_id,
    origProviderPaymentId,
    voidReference,
    processedBy: voidPayment.processed_by,
  });

  if (origPayment && origPayment.status !== "cancelled") {
    await supabase
      .from("provider_paycloud_payments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", origPayment.id);
  }

  return reversal;
}
