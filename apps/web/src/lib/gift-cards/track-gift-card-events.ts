/**
 * Server-authoritative gift card analytics (Amplitude HTTP API) with insert_id dedupe.
 *
 * Event names are string literals here on purpose: the shared taxonomy files
 * (`lib/analytics/amplitude/types.ts`, `packages/analytics/src/events.ts`) are owned
 * by the analytics workstream; add `gift_card_purchased` / `gift_card_redeemed` there
 * when that lands.
 */
import { trackServer } from "@/lib/analytics/amplitude/server";

export const EVENT_GIFT_CARD_PURCHASED = "gift_card_purchased";
export const EVENT_GIFT_CARD_REDEEMED = "gift_card_redeemed";

export async function trackGiftCardPurchasedServer(params: {
  /** Paystack reference — dedupe key `${reference}:gift_card_purchased`. */
  reference: string;
  orderId: string;
  purchaserUserId?: string | null;
  perCardAmount: number;
  quantity: number;
  totalAmount: number;
  currency?: string | null;
  scheduled?: boolean;
  deliveryChannel?: string | null;
  source?: string | null;
}): Promise<void> {
  await trackServer(
    EVENT_GIFT_CARD_PURCHASED,
    {
      portal: "client",
      gift_card_order_id: params.orderId,
      amount: params.perCardAmount,
      quantity: params.quantity,
      total_amount: params.totalAmount,
      currency: params.currency ?? undefined,
      scheduled_delivery: params.scheduled === true,
      delivery_channel: params.deliveryChannel ?? "email",
      source: params.source ?? undefined,
      transaction_id: params.reference,
    },
    params.purchaserUserId ?? undefined,
    {
      insertId: `${params.reference}:${EVENT_GIFT_CARD_PURCHASED}`,
      revenue: params.totalAmount,
      revenueType: "gift_card",
      productId: params.orderId,
      quantity: params.quantity,
    },
  );
}

export async function trackGiftCardRedeemedServer(params: {
  giftCardId: string;
  userId?: string | null;
  amount: number;
  currency?: string | null;
  /** wallet (code typed / claim link) or booking (tender at checkout). */
  redemptionType: "wallet" | "wallet_claim_link" | "booking";
  bookingId?: string | null;
  /** Extra entropy for the dedupe key when the same card can be redeemed more than once (bookings). */
  dedupeSuffix?: string | null;
}): Promise<void> {
  const suffix = params.dedupeSuffix ?? params.bookingId ?? params.redemptionType;
  await trackServer(
    EVENT_GIFT_CARD_REDEEMED,
    {
      portal: "client",
      gift_card_id: params.giftCardId,
      amount: params.amount,
      currency: params.currency ?? undefined,
      redemption_type: params.redemptionType,
      booking_id: params.bookingId ?? undefined,
    },
    params.userId ?? undefined,
    {
      insertId: `${params.giftCardId}:${suffix}:${EVENT_GIFT_CARD_REDEEMED}`,
    },
  );
}
