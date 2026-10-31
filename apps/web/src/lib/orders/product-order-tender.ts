/**
 * Who holds each product-order tender, and how much of a cancel/refund
 * the platform may put back on the customer wallet.
 *
 * Platform-held (payoutable, refundable by Beautonomi): Paystack, Stripe,
 * Flutterwave, wallet, gift card.
 * Provider-collected (provider already has the cash): cash, card-on-delivery,
 * Yoco, PayCloud, EFT, manual. Cancelling those must not create a platform
 * wallet liability for money the platform never received.
 */

export const PLATFORM_HELD_PRODUCT_PAYMENT_METHODS = [
  "paystack",
  "stripe",
  "flutterwave",
  "wallet",
  "gift_card",
] as const;

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

export function roundProductOrderMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type ProductOrderTenderInput = {
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
  payment_method?: string | null;
};

export function productOrderPaymentMethod(order: ProductOrderTenderInput): string {
  return String(order.payment_method ?? "").trim().toLowerCase();
}

export function isProviderCollectedProductMethod(method: string | null | undefined): boolean {
  return PROVIDER_COLLECTED_PRODUCT_METHODS.has(String(method ?? "").trim().toLowerCase());
}

/**
 * In-person cash refund is safe only when the provider already holds the till.
 * Paystack, Stripe, Flutterwave, wallet, gift card, and card go back through
 * store credit so the gateway and wallet legs are reversed. A blank method
 * is treated the same way: cash is not offered until a till tender is stamped.
 */
export function allowsInPersonProductOrderRefund(order: ProductOrderTenderInput): boolean {
  return isProviderCollectedProductMethod(productOrderPaymentMethod(order));
}

export function productOrderTenderSplit(order: ProductOrderTenderInput): {
  total: number;
  wallet: number;
  gift: number;
  /** Card/gateway or in-person remainder after wallet and gift card. */
  remainder: number;
} {
  const total = roundProductOrderMoney(Math.max(0, num(order.total_amount)));
  const gift = roundProductOrderMoney(Math.min(total, Math.max(0, num(order.gift_card_amount))));
  const wallet = roundProductOrderMoney(
    Math.min(Math.max(0, num(order.wallet_amount)), Math.max(0, total - gift)),
  );
  const remainder = roundProductOrderMoney(Math.max(0, total - gift - wallet));
  return { total, wallet, gift, remainder };
}

/**
 * Wallet credit when a *paid* order is cancelled.
 * - Provider-collected: only the wallet leg the platform already debited.
 * - Gateway / wallet / gift / unknown: everything not already returned on the
 *   card. A failed gateway refund (`onlineRefundedAmount` 0) falls back to wallet.
 * Gift card is excluded here; the caller restores it onto the card and adds it
 * back only if that void fails.
 */
export function computeProductOrderCancelWalletCredit(
  order: ProductOrderTenderInput,
  onlineRefundedAmount = 0,
): number {
  const { total, wallet, gift } = productOrderTenderSplit(order);
  const onlineRefunded = roundProductOrderMoney(Math.max(0, onlineRefundedAmount));
  if (isProviderCollectedProductMethod(productOrderPaymentMethod(order))) {
    return wallet;
  }
  const afterGift = roundProductOrderMoney(Math.max(0, total - gift));
  return roundProductOrderMoney(Math.max(0, afterGift - onlineRefunded));
}

/** Cash/terminal still in the provider's till after a platform cancel. */
export function computeInPersonProductOrderRefundDue(
  order: ProductOrderTenderInput,
): number {
  if (!isProviderCollectedProductMethod(productOrderPaymentMethod(order))) return 0;
  return productOrderTenderSplit(order).remainder;
}

/**
 * Store-credit on a provider-collected order creates a new platform wallet
 * liability. Claw the provider for that full credit (their till kept the cash).
 * Gateway orders are clawed from the capture rows instead — return 0 here.
 */
export function computeProviderCollectedStoreCreditClawback(
  order: ProductOrderTenderInput,
  walletCreditIssued: number,
): number {
  if (!isProviderCollectedProductMethod(productOrderPaymentMethod(order))) return 0;
  return roundProductOrderMoney(Math.max(0, walletCreditIssued));
}

/**
 * Amount the provider actually collected in person. Wallet and gift card were
 * already taken by the platform at checkout and must not be recorded again as cash.
 */
export function computeInPersonCollectibleAmount(order: ProductOrderTenderInput): number {
  const { total, remainder } = productOrderTenderSplit(order);
  if (remainder > 0) return remainder;
  const hasSplit = num(order.wallet_amount) > 0 || num(order.gift_card_amount) > 0;
  return hasSplit ? 0 : total;
}
