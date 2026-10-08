import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordBookingStripePayment } from "@/lib/bookings/record-booking-stripe-payment";
import { recordBookingOnlineChargeLedger } from "@/lib/bookings/record-booking-online-charge-ledger";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { ensureWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { getCurrencyMeta } from "@beautonomi/utils";
import { extractStripeExchangeRate } from "@/lib/fx/stripe-exchange-rate";

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

type StripeChargeLike = {
  id?: string;
  payment_intent?: string;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
  metadata?: Record<string, unknown> & { booking_id?: string; reference?: string };
};

function stripeMinorToMajor(amountMinor: number | undefined, currency: string): number {
  const factor = 10 ** getCurrencyMeta(currency).minorUnits;
  return Math.round((Number(amountMinor || 0) / factor) * 100) / 100;
}

async function resolveBookingTenantId(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("tenant_id")
    .eq("id", bookingId)
    .maybeSingle();
  return (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
}

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

/**
 * Handle Stripe `charge.refunded` — post a booking refund mirror of the Paystack refund path.
 */
export async function handleStripeChargeRefunded(charge: StripeChargeLike): Promise<void> {
  const supabase: SupabaseClient = getSupabaseAdmin();
  const bookingId =
    typeof charge.metadata?.booking_id === "string" ? charge.metadata.booking_id.trim() : "";
  if (!bookingId) return;

  const currency = (charge.currency || "ZAR").toUpperCase();
  const refundMajor = stripeMinorToMajor(charge.amount_refunded, currency);
  if (refundMajor <= 0) return;

  const refundProviderId = charge.payment_intent ?? charge.id ?? null;

  // Idempotent: keyed by refund_provider_id so retries don't double-post.
  const { data: existing } = await supabase
    .from("booking_refunds")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("refund_provider_id", refundProviderId ?? "")
    .maybeSingle();
  if (existing) return;

  await supabase.from("booking_refunds").insert({
    booking_id: bookingId,
    amount: refundMajor,
    reason: "stripe_charge_refunded",
    refund_method: "original",
    refund_provider_id: refundProviderId,
    status: "completed",
    notes: `Stripe charge refund (${currency})`,
  });

  void import("@/lib/integrations/slack/ops-triggers")
    .then(({ slackNotifyHighValueRefund }) =>
      slackNotifyHighValueRefund({
        refundId: String(refundProviderId ?? charge.id ?? bookingId),
        bookingId,
        amountMajor: refundMajor,
        currency,
        stage: "processed",
        reason: "stripe_charge.refunded",
      }),
    )
    .catch(() => undefined);
}
