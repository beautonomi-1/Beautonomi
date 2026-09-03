/**
 * Audit ledger legs for product-order tenders, posted once when the order is paid.
 * Mirrors `postBookingAuditLedgerLegsIfMissing` (bookings) so admin aggregation
 * treats products and services the same:
 *   - promotion_discount            (amount = promo, net = -promo)
 *   - gift_card_payment             (amount = gift, net = +gift)
 *   - gift_card_liability_reduction (amount = gift, net = -gift)  → DR 2400
 *
 * `provider_earnings` / `platform_fee` are still computed on the full order total
 * by `recordProductOrderPayment`; these legs are contra/audit rows keyed on
 * `product_order_id` and de-duplicated per transaction_type.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductOrderTenderLegsInput = {
  productOrderId: string;
  providerId: string | null;
  tenantId: string | null;
  orderNumber: string;
  currency?: string | null;
  promotionDiscount?: number | null;
  giftCardAmount?: number | null;
  createdAt?: string;
};

export type ProductOrderTenderLeg = {
  transaction_type: string;
  amount: number;
  net: number;
  description: string;
};

/** Pure: which legs should exist for the given tender amounts. */
export function buildProductOrderTenderLegs(input: {
  orderNumber: string;
  promotionDiscount?: number | null;
  giftCardAmount?: number | null;
}): ProductOrderTenderLeg[] {
  const legs: ProductOrderTenderLeg[] = [];
  const promo = Math.round(Math.max(0, Number(input.promotionDiscount ?? 0)) * 100) / 100;
  const gift = Math.round(Math.max(0, Number(input.giftCardAmount ?? 0)) * 100) / 100;
  if (promo > 0) {
    legs.push({
      transaction_type: "promotion_discount",
      amount: promo,
      net: -promo,
      description: `Promotion discount for product order ${input.orderNumber}`,
    });
  }
  if (gift > 0) {
    legs.push({
      transaction_type: "gift_card_payment",
      amount: gift,
      net: gift,
      description: `Gift card payment for product order ${input.orderNumber}`,
    });
    legs.push({
      transaction_type: "gift_card_liability_reduction",
      amount: gift,
      net: -gift,
      description: `Gift card liability reduction for product order ${input.orderNumber}`,
    });
  }
  return legs;
}

/** Insert missing legs (idempotent per product_order_id + transaction_type). Never throws. */
export async function postProductOrderTenderLegsIfMissing(
  supabase: SupabaseClient,
  input: ProductOrderTenderLegsInput,
): Promise<{ posted: string[] }> {
  const legs = buildProductOrderTenderLegs(input);
  const posted: string[] = [];
  if (legs.length === 0) return { posted };

  const now = input.createdAt ?? new Date().toISOString();
  try {
    const { data: existing } = await (supabase.from("finance_transactions") as any)
      .select("transaction_type")
      .eq("product_order_id", input.productOrderId)
      .in(
        "transaction_type",
        legs.map((l) => l.transaction_type),
      );
    const have = new Set<string>(
      ((existing ?? []) as Array<{ transaction_type?: string }>).map((r) => String(r.transaction_type)),
    );
    const rows = legs
      .filter((l) => !have.has(l.transaction_type))
      .map((l) => ({
        booking_id: null,
        product_order_id: input.productOrderId,
        provider_id: input.providerId,
        tenant_id: input.tenantId,
        transaction_type: l.transaction_type,
        amount: l.amount,
        fees: 0,
        commission: 0,
        net: l.net,
        ...(input.currency ? { currency: input.currency } : {}),
        description: l.description,
        created_at: now,
      }));
    if (rows.length === 0) return { posted };
    const { error } = await (supabase.from("finance_transactions") as any).insert(rows);
    if (error) {
      console.error("[product-order-tender-legs] insert failed:", error.message, {
        productOrderId: input.productOrderId,
      });
      return { posted };
    }
    for (const r of rows) posted.push(r.transaction_type);
  } catch (e) {
    console.error("[product-order-tender-legs] unexpected:", e, { productOrderId: input.productOrderId });
  }
  return { posted };
}
