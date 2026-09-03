import { EVENT_GIFT_CARD_PURCHASED, EVENT_GIFT_CARD_REDEEMED } from "./types";
import { trackMoneyEventServer } from "./track-money-event-server";

export async function trackGiftCardPurchasedServer(params: {
  reference: string;
  giftCardId: string;
  amount: number;
  currency?: string | null;
  purchaserId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_GIFT_CARD_PURCHASED, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.purchaserId,
    paymentMethod: params.paymentMethod,
    paymentProvider: params.paymentProvider ?? "paystack",
    revenueType: "gift_card",
    productId: params.giftCardId,
    properties: { gift_card_id: params.giftCardId },
  });
}

/**
 * Gift card redeemed against a booking or order. Reference = redemption row id (or
 * `${giftCardId}:${bookingId}`) so the same redemption never double counts.
 */
export async function trackGiftCardRedeemedServer(params: {
  reference: string;
  giftCardId: string;
  amount: number;
  currency?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  orderId?: string | null;
}): Promise<void> {
  await trackMoneyEventServer(EVENT_GIFT_CARD_REDEEMED, {
    reference: params.reference,
    amount: params.amount,
    currency: params.currency,
    userId: params.customerId,
    paymentMethod: "gift_card",
    paymentProvider: "beautonomi",
    revenueType: "gift_card_redemption",
    productId: params.giftCardId,
    properties: {
      gift_card_id: params.giftCardId,
      booking_id: params.bookingId ?? undefined,
      order_id: params.orderId ?? undefined,
    },
  });
}
