/**
 * Return the card (gateway) portion of a paid product order to the original tender.
 *
 * Tender split on a product order:
 *   total_amount = gift_card_amount + wallet_amount + online (card) portion
 *
 * Gift card → re-credited to the card by `voidProductOrderGiftCard`; wallet → wallet
 * credit; the card portion is refunded here through the payment provider's refund
 * capability (Paystack today). If the gateway refund fails the caller falls back to
 * a wallet credit so the customer is never left unpaid.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OnlineTenderOrder = {
  id: string;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  currency?: string | null;
  tenant_id?: string | null;
  order_number?: string | null;
};

const GATEWAY_METHODS = new Set(["paystack", "card", "online"]);

/** Pure: card/gateway portion of the order total (never negative). */
export function computeProductOrderOnlinePortion(order: OnlineTenderOrder): number {
  const total = Math.max(0, Number(order.total_amount ?? 0));
  const wallet = Math.max(0, Number(order.wallet_amount ?? 0));
  const gift = Math.max(0, Number(order.gift_card_amount ?? 0));
  return Math.max(0, Math.round((total - wallet - gift) * 100) / 100);
}

export type RefundOnlineTenderResult = {
  attempted: boolean;
  refundedAmount: number;
  refundId: string | null;
  error?: string;
};

export async function refundProductOrderOnlineTender(
  admin: SupabaseClient,
  order: OnlineTenderOrder,
  opts: { reason: string; idempotencyKey: string },
): Promise<RefundOnlineTenderResult> {
  const portion = computeProductOrderOnlinePortion(order);
  const method = String(order.payment_method ?? "").toLowerCase();
  const reference = order.payment_reference ?? null;
  if (order.payment_status !== "paid" || portion <= 0 || !GATEWAY_METHODS.has(method) || !reference) {
    return { attempted: false, refundedAmount: 0, refundId: null };
  }

  try {
    const { paystackProvider } = await import("@/lib/payments/provider/paystack-provider");
    const result = await paystackProvider.refund({
      providerPaymentId: reference,
      amountInSmallestUnit: Math.round(portion * 100),
      currency: order.currency ?? "ZAR",
      reason: opts.reason,
      tenantId: order.tenant_id ?? null,
      idempotencyKey: opts.idempotencyKey,
    });

    // Best-effort: reflect the refund on the charge row so finance reports reconcile.
    try {
      await (admin.from("payment_transactions") as any)
        .update({
          refund_amount: portion,
          refunded_at: new Date().toISOString(),
          status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("product_order_id", order.id)
        .eq("status", "success");
    } catch (e) {
      console.warn("[refundProductOrderOnlineTender] payment_transactions sync failed:", e);
    }

    return { attempted: true, refundedAmount: portion, refundId: result.refundId || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[refundProductOrderOnlineTender] gateway refund failed:", message, {
      productOrderId: order.id,
    });
    return { attempted: true, refundedAmount: 0, refundId: null, error: message };
  }
}
