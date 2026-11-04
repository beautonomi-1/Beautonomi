/**
 * Gift card tender on product orders — thin wrappers over the order-scoped
 * reserve / capture / void RPCs (migration 879), mirroring the booking flow:
 *   reserve at checkout → capture when the order becomes paid → void on any
 *   failure / cancel path (balance restored).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Use as much of the gift card as it can cover. A short card does not fail the order. */
export function plannedProductOrderGiftAmount(input: {
  requested: number | null;
  orderTotal: number;
  cardBalance: number;
}): number {
  const total = Math.max(0, Number(input.orderTotal) || 0);
  const requested =
    input.requested == null ? total : Math.max(0, Number(input.requested) || 0);
  const balance = Math.max(0, Number(input.cardBalance) || 0);
  return Math.round(Math.min(requested, total, balance) * 100) / 100;
}

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
 * `restored` — balance is back on the card (this call, or it was already voided).
 * `missing` — no redemption row, so the balance was never held.
 * `failed` — the void call errored. The hold may still be reserved or captured.
 */
export type ProductOrderGiftCardVoidResult = "restored" | "missing" | "failed";

async function voidProductOrderGiftCardOnce(
  supabase: SupabaseClient,
  productOrderId: string,
): Promise<ProductOrderGiftCardVoidResult> {
  try {
    const { data, error } = await (supabase.rpc as any)("void_gift_card_redemption_for_order", {
      p_product_order_id: productOrderId,
    });
    if (error) {
      console.error("[product-order-gift-card] void failed:", error.message, { productOrderId });
      return "failed";
    }
    return data === true ? "restored" : "missing";
  } catch (e) {
    console.error("[product-order-gift-card] void threw:", e, { productOrderId });
    return "failed";
  }
}

/**
 * Restore the gift card balance for a reserved OR captured redemption
 * (checkout failure, stale sweep, customer/provider cancel, refund). Never throws.
 * A failed call is tried once more. A second success is safe: an already-voided
 * redemption returns true and does not add the balance again.
 */
export async function voidProductOrderGiftCard(
  supabase: SupabaseClient,
  productOrderId: string,
): Promise<ProductOrderGiftCardVoidResult> {
  const first = await voidProductOrderGiftCardOnce(supabase, productOrderId);
  if (first !== "failed") return first;
  return voidProductOrderGiftCardOnce(supabase, productOrderId);
}
