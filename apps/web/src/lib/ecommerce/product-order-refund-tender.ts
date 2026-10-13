import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refundProductOrderOnlineTender,
  type OnlineTenderOrder,
} from "@/lib/ecommerce/refund-product-order-online-tender";
import { voidProductOrderGiftCardIfNeeded } from "@/lib/orders/product-order-lifecycle";

export type ProductOrderRefundTenderResult = {
  onlineRefundedAmount: number;
  walletCreditAmount: number;
  giftCardRestored: number;
  /** Gateway was tried but failed — wallet credit includes the card portion (fallback). */
  onlineRefundFailed: boolean;
  /** Gift or card money already went back; the order must not be rolled back to paid. */
  tenderMoved: boolean;
};

/**
 * Split a product-order refund across its original tenders.
 *
 * Full refund: gift card leg is voided back onto the card, the card leg is refunded
 * through the gateway, and the remainder (wallet leg, plus the card leg when the
 * gateway refund fails) is returned as wallet credit.
 * Partial refund: wallet credit only — the gateway refund and gift void always
 * return the whole leg, so using them here would over-refund.
 */
export async function splitProductOrderRefundTender(
  admin: SupabaseClient,
  order: OnlineTenderOrder,
  opts: { refundAmount: number; reason: string; idempotencyKey: string },
): Promise<ProductOrderRefundTenderResult> {
  const refundAmount = Math.max(0, opts.refundAmount);
  const isFullRefund = refundAmount + 0.01 >= Number(order.total_amount ?? 0);
  if (!isFullRefund) {
    return {
      onlineRefundedAmount: 0,
      walletCreditAmount: refundAmount,
      giftCardRestored: 0,
      onlineRefundFailed: false,
      tenderMoved: false,
    };
  }

  const giftCardRestored = Math.min(
    refundAmount,
    Math.max(0, Number(order.gift_card_amount ?? 0)),
  );
  if (giftCardRestored > 0) {
    await voidProductOrderGiftCardIfNeeded(admin, order);
  }
  const afterGift = Math.round((refundAmount - giftCardRestored) * 100) / 100;

  const online = await refundProductOrderOnlineTender(admin, order, {
    reason: opts.reason,
    idempotencyKey: opts.idempotencyKey,
  });
  const onlineRefundedAmount = online.refundedAmount;
  return {
    onlineRefundedAmount,
    walletCreditAmount: Math.max(
      0,
      Math.round((afterGift - onlineRefundedAmount) * 100) / 100,
    ),
    giftCardRestored,
    onlineRefundFailed: Boolean(online.attempted && online.error),
    tenderMoved: giftCardRestored > 0 || onlineRefundedAmount > 0,
  };
}
