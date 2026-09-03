/**
 * Gift card tender on product orders — thin wrappers over the order-scoped
 * reserve / capture / void RPCs (migration 879), mirroring the booking flow:
 *   reserve at checkout → capture when the order becomes paid → void on any
 *   failure / cancel path (balance restored).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ReserveProductOrderGiftCardResult =
  | { ok: true; giftCardId: string | null; redemptionId: string | null; remainingBalance: number | null }
  | { ok: false; message: string };

export async function reserveProductOrderGiftCard(
  supabase: SupabaseClient,
  params: { code: string; amount: number; productOrderId: string; currency: string },
): Promise<ReserveProductOrderGiftCardResult> {
  const code = params.code.trim().toUpperCase();
  const amount = Math.round(Number(params.amount) * 100) / 100;
  if (!code) return { ok: false, message: "Gift card code is required" };
  if (!(amount > 0)) return { ok: false, message: "Gift card amount must be greater than zero" };

  const { data, error } = await (supabase.rpc as any)("reserve_gift_card_redemption_for_order", {
    p_code: code,
    p_amount: amount,
    p_product_order_id: params.productOrderId,
    p_currency: params.currency,
  });
  if (error) {
    return { ok: false, message: error.message || "Invalid gift card" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { gift_card_id?: string | null; redemption_id?: string | null; remaining_balance?: number | null }
    | null
    | undefined;
  return {
    ok: true,
    giftCardId: row?.gift_card_id ?? null,
    redemptionId: row?.redemption_id ?? null,
    remainingBalance: row?.remaining_balance != null ? Number(row.remaining_balance) : null,
  };
}

/** Idempotent: returns true when captured (now or previously). Never throws. */
export async function captureProductOrderGiftCard(
  supabase: SupabaseClient,
  productOrderId: string,
): Promise<boolean> {
  try {
    const { data, error } = await (supabase.rpc as any)("capture_gift_card_redemption_for_order", {
      p_product_order_id: productOrderId,
    });
    if (error) {
      console.error("[product-order-gift-card] capture failed:", error.message, { productOrderId });
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[product-order-gift-card] capture threw:", e, { productOrderId });
    return false;
  }
}

/**
 * Restore the gift card balance for a reserved OR captured redemption
 * (checkout failure, stale sweep, customer/provider cancel, refund). Never throws.
 */
export async function voidProductOrderGiftCard(
  supabase: SupabaseClient,
  productOrderId: string,
): Promise<boolean> {
  try {
    const { data, error } = await (supabase.rpc as any)("void_gift_card_redemption_for_order", {
      p_product_order_id: productOrderId,
    });
    if (error) {
      console.error("[product-order-gift-card] void failed:", error.message, { productOrderId });
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[product-order-gift-card] void threw:", e, { productOrderId });
    return false;
  }
}
