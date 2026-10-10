import {
  handleStripeChargeRefunded,
  handleStripeChargeRefundedBackstop,
  handleStripeChargeUpdated,
  handleStripeDisputeFundsWithdrawn,
  handleStripeRefundCreated,
  handleStripeTransferReversed,
} from "@/lib/payments/stripe-settlement";

export {
  handleStripeChargeUpdated,
  handleStripeRefundCreated,
  handleStripeChargeRefundedBackstop,
  handleStripeDisputeFundsWithdrawn,
  handleStripeTransferReversed,
  handleStripeChargeRefunded,
};

type StripePaymentIntentLike = {
  id?: string;
  amount?: number;
  amount_received?: number;
  currency?: string;
  metadata?: Record<string, unknown> & {
    booking_id?: string;
    reference?: string;
    wallet_amount_applied?: string | number;
    gift_card_amount_applied?: string | number;
    payment_option?: string;
    requires_deposit?: string | boolean;
  };
};

/**
 * Handle Stripe `payment_intent.succeeded` through the shared settlement dispatcher
 * (same products as Paystack charge.success).
 */
export async function handleStripePaymentIntentSucceeded(
  intent: StripePaymentIntentLike,
): Promise<void> {
  const { settleStripePaymentIntentSucceeded } = await import(
    "@/lib/payments/settle-stripe-online-payment"
  );
  await settleStripePaymentIntentSucceeded(intent as Parameters<
    typeof settleStripePaymentIntentSucceeded
  >[0]);
}
