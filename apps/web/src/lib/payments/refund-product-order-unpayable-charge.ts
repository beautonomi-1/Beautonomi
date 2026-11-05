import type { SupabaseClient } from "@supabase/supabase-js";

/** Refund a Paystack charge when the product order can no longer accept payment. */
export async function refundProductOrderUnpayableCharge(
  _admin: SupabaseClient,
  params: {
    productOrderId: string;
    reference: string;
    amountMajor: number;
    currency: string;
    tenantId: string | null;
    reason: string;
  },
): Promise<void> {
  const { refundGatewayCharge } = await import("@/lib/payments/refund-gateway-charge");
  await refundGatewayCharge({
    reference: params.reference,
    amountMajor: params.amountMajor,
    currency: params.currency,
    tenantId: params.tenantId,
    reason: params.reason,
    // Same key as charge.success so verify, saved-card, and the webhook
    // refund one closed-order charge once.
    idempotencyKey: `product_order_late_success_refund:${params.productOrderId}:${params.reference}`,
    fallbackProvider: "paystack",
  });
}
