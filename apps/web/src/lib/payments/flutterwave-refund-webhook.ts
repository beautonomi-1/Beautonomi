/**
 * F2-26: Flutterwave `refund.completed` webhook.
 *
 * Flutterwave v3 emits `refund.completed` once a refund settles. The payload
 * (`data`) carries the refund `id`, `amount_refunded` (MAJOR units — Flutterwave
 * amounts are never minor units, see F2-15), `status`, the original
 * transaction's `flw_ref`, and — depending on dashboard version — `tx_ref`
 * and/or `transaction_id`. We mirror the Paystack `refund.processed` handler:
 *
 *   1. idempotent on the refund id (payment_transactions refund row),
 *   2. resolve the original charge (tx_ref → payment_transactions.reference,
 *      or transaction_id → online_payment_checkouts.payment_intent_id),
 *   3. insert a `refund` payment_transactions row,
 *   4. booking charges: insert a completed `booking_refunds` row capped to the
 *      remaining refundable balance (F2-33); non-booking charges go through
 *      `applyNonBookingRefundFromTransaction`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCurrency } from "@beautonomi/utils";
import { resolveBookingPaymentIdForRefund } from "@/lib/bookings/resolve-booking-refund-payment-id";
import { applyNonBookingRefundFromTransaction } from "@/lib/payments/apply-non-booking-refund-from-transaction";
import { capGatewayRefundToRemainingBalance } from "@/lib/bookings/cap-gateway-refund-to-remaining-balance";

type PaymentTxnRow = {
  id?: string;
  booking_id?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
  provider?: string | null;
};

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

async function resolveOriginalReference(
  data: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<string | null> {
  const txRef = str(data.tx_ref) ?? str(data.reference) ?? str(data.transaction_reference);
  if (txRef) return txRef;
  // Some dashboard versions only carry the Flutterwave transaction id; our
  // checkout rows store it as payment_intent_id (see refund-gateway-charge.ts).
  const transactionId = str(data.transaction_id) ?? str(data.tx_id);
  if (transactionId) {
    const { data: checkout } = await supabase
      .from("online_payment_checkouts")
      .select("reference")
      .eq("provider", "flutterwave")
      .eq("payment_intent_id", transactionId)
      .maybeSingle();
    const ref = (checkout as { reference?: string } | null)?.reference;
    if (ref) return ref;
  }
  return null;
}

export async function handleFlutterwaveRefundWebhook(
  data: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<{ handled: boolean; reason?: string }> {
  const status = String(data.status ?? "").toLowerCase();
  if (!["completed", "successful", "success"].includes(status)) {
    return { handled: false, reason: `status_${status || "unknown"}` };
  }

  const refundId = str(data.id) ?? str(data.refund_id);
  if (!refundId) return { handled: false, reason: "missing_refund_id" };

  const rawAmount = data.amount_refunded ?? data.amount;
  const refundAmount = roundCurrency(Math.max(0, Number(rawAmount) || 0));
  if (refundAmount <= 0) return { handled: false, reason: "zero_amount" };

  const currency = String(data.currency ?? "ZAR").toUpperCase();

  // 1. Idempotency on the Flutterwave refund id.
  const { data: existingRefund } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("reference", refundId)
    .eq("transaction_type", "refund")
    .maybeSingle();
  if (existingRefund) {
    console.log(`[flutterwave/refund] refund ${refundId} already recorded, skipping (idempotent)`);
    return { handled: true, reason: "duplicate" };
  }

  // 2. Original charge.
  const reference = await resolveOriginalReference(data, supabase);
  let txn: PaymentTxnRow | null = null;
  if (reference) {
    const { data: found } = await supabase
      .from("payment_transactions")
      .select("id, booking_id, amount, metadata, provider")
      .eq("reference", reference)
      .in("status", ["success", "partially_refunded"])
      .maybeSingle();
    txn = (found as PaymentTxnRow | null) ?? null;
  }

  // 3. Refund fact row (gateway amount, untouched).
  await supabase.from("payment_transactions").insert({
    booking_id: txn?.booking_id || null,
    reference: refundId,
    amount: refundAmount,
    fees: 0,
    net_amount: refundAmount,
    status: "refunded",
    provider: "flutterwave",
    transaction_type: "refund",
    metadata: {
      original_reference: reference,
      flutterwave_refund_id: refundId,
      flw_ref: str(data.flw_ref),
      flutterwave_data: data,
    },
    created_at: new Date().toISOString(),
  });

  if (txn?.booking_id) {
    const bookingPaymentId = reference
      ? await resolveBookingPaymentIdForRefund(supabase, txn.booking_id, reference)
      : null;

    const { data: existingBookingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", refundId)
      .maybeSingle();

    if (!existingBookingRefund) {
      // 4. F2-33 cap.
      const cap = await capGatewayRefundToRemainingBalance(supabase, {
        bookingId: txn.booking_id,
        requestedAmount: refundAmount,
        psp: "flutterwave",
        refundReference: refundId,
        currency,
      });
      if (cap.amount > 0) {
        await (supabase.from("booking_refunds") as any).insert({
          booking_id: txn.booking_id,
          payment_id: bookingPaymentId,
          amount: cap.amount,
          reason: `Flutterwave refund: ${reference ?? refundId}`,
          refund_method: "original",
          refund_provider_id: refundId,
          status: "completed",
          notes: cap.capped
            ? `Auto-created by Flutterwave refund.completed handler; gateway amount ${refundAmount.toFixed(2)} capped to remaining balance ${cap.amount.toFixed(2)}`
            : "Auto-created by Flutterwave refund.completed handler",
        });
      }
    }

    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      const { insertNotification } = await import("@/lib/notifications/insert-notification");
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, customer_id, booking_number")
        .eq("id", txn.booking_id)
        .maybeSingle();
      const customerId = (booking as { customer_id?: string } | null)?.customer_id;
      const bookingNumber = (booking as { booking_number?: string } | null)?.booking_number;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Processed",
            message: `Your refund${bookingNumber ? ` for booking ${bookingNumber}` : ""} has been processed.`,
            data: { type: "refund_processed", booking_id: txn.booking_id },
            url: `/bookings/${txn.booking_id}`,
          },
          ["push"],
          { appType: "customer" },
        );
        await insertNotification({
          user_id: customerId,
          type: "refund_processed",
          title: "Refund Processed",
          message: "Your refund has been processed.",
          data: { booking_id: txn.booking_id },
          action_url: `/bookings/${txn.booking_id}`,
        });
      }
    } catch (notifError) {
      console.error("[flutterwave/refund] customer notification failed:", notifError);
    }
  } else if (txn && reference) {
    await applyNonBookingRefundFromTransaction({
      supabase,
      reference,
      refundAmountMajor: refundAmount,
      refundReference: refundId,
      txn,
      reason: "flutterwave_refund.completed",
    });
  } else {
    console.warn(`[flutterwave/refund] refund ${refundId} could not be matched to a charge`, {
      reference,
      flw_ref: str(data.flw_ref),
    });
  }

  void import("@/lib/integrations/slack/ops-triggers")
    .then(({ slackNotifyHighValueRefund }) =>
      slackNotifyHighValueRefund({
        refundId,
        bookingId: txn?.booking_id ?? null,
        amountMajor: refundAmount,
        currency,
        stage: "processed",
        reason: "flutterwave.refund.completed",
      }),
    )
    .catch(() => undefined);

  return { handled: true };
}
