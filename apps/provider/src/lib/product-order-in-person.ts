/**
 * Mirrors `allowsInPersonProductOrderRefund` in
 * apps/web/src/lib/orders/product-order-tender.ts.
 * Provider-collected tenders can be handed back in cash. Paystack, Stripe,
 * Flutterwave, wallet, gift card, card, and a blank method cannot.
 */
const PROVIDER_COLLECTED_PRODUCT_METHODS = new Set([
  "cash",
  "yoco",
  "paycloud",
  "card_on_delivery",
  "bank_transfer",
  "manual",
  "other",
  "eft",
]);

export function allowsInPersonProductRefund(paymentMethod: string | null | undefined): boolean {
  const method = String(paymentMethod ?? "").trim().toLowerCase();
  return PROVIDER_COLLECTED_PRODUCT_METHODS.has(method);
}

/** In-person remainder after wallet and gift card. Matches the server collectible. */
export function productOrderInPersonDue(order: {
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
}): number {
  const total = Math.max(0, Number(order.total_amount ?? 0));
  const gift = Math.min(total, Math.max(0, Number(order.gift_card_amount ?? 0)));
  const wallet = Math.min(Math.max(0, Number(order.wallet_amount ?? 0)), Math.max(0, total - gift));
  return Math.round(Math.max(0, total - gift - wallet) * 100) / 100;
}
