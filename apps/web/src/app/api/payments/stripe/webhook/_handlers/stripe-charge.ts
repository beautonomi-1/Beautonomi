import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordBookingStripePayment } from "@/lib/bookings/record-booking-stripe-payment";
import { recordBookingOnlineChargeLedger } from "@/lib/bookings/record-booking-online-charge-ledger";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { ensureWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { getCurrencyMeta } from "@beautonomi/utils";

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
 * Handle Stripe `payment_intent.succeeded` for booking payments.
 * Mirrors the Paystack booking charge path: record payment → settle wallet/gift → sync lifecycle.
 */
export async function handleStripePaymentIntentSucceeded(
  intent: StripePaymentIntentLike,
): Promise<void> {
  const supabase: SupabaseClient = getSupabaseAdmin();
  const bookingId =
    typeof intent.metadata?.booking_id === "string" ? intent.metadata.booking_id.trim() : "";
  if (!bookingId) {
    // Non-booking PaymentIntent (wallet top-up, order, etc.) — not handled here yet.
    return;
  }

  const currency = (intent.currency || "ZAR").toUpperCase();
  const amountMajor = stripeMinorToMajor(intent.amount_received ?? intent.amount, currency);
  const tenantId = await resolveBookingTenantId(supabase, bookingId);
  const reference =
    typeof intent.metadata?.reference === "string" ? intent.metadata.reference : intent.id ?? null;

  const walletAmount = Number(intent.metadata?.wallet_amount_applied ?? 0) || 0;
  const giftCardAmount = Number(intent.metadata?.gift_card_amount_applied ?? 0) || 0;

  const recorded = await recordBookingStripePayment(supabase, {
    bookingId,
    tenantId,
    paymentIntentId: intent.id ?? null,
    reference,
    amountMajor,
    currency,
    source: "stripe_webhook",
  });

  if (!recorded.ok) {
    const reason = "reason" in recorded ? recorded.reason : "unknown";
    console.error("[stripe-charge] failed to record booking payment", bookingId, reason);
    throw new Error(`Failed to record Stripe booking payment for ${bookingId}: ${reason}`);
  }

  const ledgerReference =
    typeof intent.metadata?.reference === "string" && intent.metadata.reference.trim()
      ? intent.metadata.reference.trim()
      : intent.id ?? "";

  const ledger = await recordBookingOnlineChargeLedger(supabase, {
    bookingId,
    reference: ledgerReference,
    provider: "stripe",
    amountMajor,
    feesMajor: 0,
    walletAmountApplied: walletAmount,
    giftCardAmountApplied: giftCardAmount,
    metadata: {
      stripe_payment_intent_id: intent.id ?? null,
      source: "stripe_webhook",
    },
  });
  if (ledger.ok === false) {
    throw new Error(`Failed to record Stripe finance ledger for ${bookingId}: ${ledger.reason}`);
  }

  if (walletAmount > 0 || giftCardAmount > 0) {
    await ensureWalletGiftBookingPayments(supabase, {
      bookingId,
      tenantId,
      walletAmount,
      giftCardAmount,
      initialStatus: "completed",
    });
  }

  await syncBookingAfterPaystackSuccess(supabase, bookingId, {
    paymentReference: reference ?? undefined,
    paymentProvider: "stripe",
  });
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
}
