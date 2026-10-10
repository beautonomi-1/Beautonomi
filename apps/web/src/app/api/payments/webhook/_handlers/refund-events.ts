/**
 * Refund Event Handlers
 *
 * Handles Paystack refund webhook events:
 *   - refund.processed — Refund completed successfully
 *   - refund.failed    — Refund failed
 */
import { NextResponse } from "next/server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { resolveBookingPaymentIdForRefund } from "@/lib/bookings/resolve-booking-refund-payment-id";
import { applyNonBookingRefundFromTransaction } from "@/lib/payments/apply-non-booking-refund-from-transaction";

// ─── Exported Handler ────────────────────────────────────────────────────────

/**
 * Handle all refund.* events — update payment / transaction records.
 */
export async function handleRefundEvent(
  event: PaystackEvent,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  const { event: eventType, data } = event;

  if (eventType === "refund.processed") {
    await handleRefundProcessed(data, supabase);
  } else if (eventType === "refund.failed") {
    await handleRefundFailed(data, supabase);
  } else {
    console.log(`Unhandled refund event type: ${eventType}`);
  }

  return NextResponse.json({ received: true });
}

// ─── Internal Handlers ───────────────────────────────────────────────────────

async function handleRefundProcessed(data: Record<string, unknown>, supabase: SupabaseClient) {
  const reference = data?.transaction_reference || data?.reference;
  const refundAmount = data?.amount != null ? convertFromSmallestUnit(Number(data.amount), String(data?.currency ?? "ZAR")) : 0;
  const refundReference = data?.refund_reference || data?.id;

  if (!reference) {
    console.log("Refund processed event missing transaction reference");
    return;
  }

  // Find the original payment transaction (include metadata to detect product orders)
  const { data: txn } = await supabase.from("payment_transactions")
    .select("id, booking_id, amount, metadata")
    .eq("reference", reference)
    .in("status", ["success", "partially_refunded"])
    .maybeSingle();

  // Idempotency: skip if this refund reference was already recorded
  const refundRef = String(refundReference || reference);
  const { data: existingRefund } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("reference", refundRef)
    .eq("transaction_type", "refund")
    .maybeSingle();

  if (existingRefund) {
    console.log(`Paystack refund ${refundRef} already recorded, skipping (idempotent)`);
    return;
  }

  await supabase.from("payment_transactions").insert({
    booking_id: txn?.booking_id || null,
    reference: refundRef,
    amount: refundAmount,
    fees: 0,
    net_amount: refundAmount,
    status: "refunded",
    provider: "paystack",
    transaction_type: "refund",
    metadata: {
      original_reference: reference,
      refund_reference: refundReference,
      paystack_data: data,
    },
    created_at: new Date().toISOString(),
  });

  if (txn?.booking_id) {
    // Booking-linked refund: keep full vs partial refund state honest.
    // The create_finance_ledger_from_booking_refund trigger (migration 490) is the
    // SOLE writer of the finance_transactions refund entry; app-side inserts have
    // been removed to prevent duplicate ledger rows.
    // Resolve the originating booking_payments row so booking_refunds.payment_id is set.
    // Without it the DB trigger still fires but the ledger entry won't carry source_payment_id.
    const bookingPaymentId = await resolveBookingPaymentIdForRefund(
      supabase,
      txn.booking_id,
      String(reference),
    );

    // Idempotency: do not insert a duplicate booking_refunds row for the same refund reference.
    const { data: existingBookingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", String(refundReference || reference))
      .maybeSingle();

    if (!existingBookingRefund) {
      await (supabase.from("booking_refunds") as any).insert({
        booking_id: txn.booking_id,
        payment_id: bookingPaymentId,
        amount: refundAmount,
        reason: `Paystack webhook: ${reference}`,
        refund_method: "original",
        refund_provider_id: String(refundReference || reference),
        status: "completed",
        notes: `Auto-created by refund webhook handler`,
      });
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
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Processed",
            message: `Your refund${(booking as { booking_number?: string } | null)?.booking_number ? ` for booking ${(booking as { booking_number?: string }).booking_number}` : ""} has been processed.`,
            data: { type: "refund_processed", booking_id: txn.booking_id },
            url: txn.booking_id ? `/bookings/${txn.booking_id}` : "/bookings",
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
          action_url: txn.booking_id ? `/bookings/${txn.booking_id}` : "/bookings",
        });
      }
    } catch (notifError) {
      console.error("Failed to send refund processed booking notification:", notifError);
    }
  } else {
    await applyNonBookingRefundFromTransaction({
      supabase,
      reference: String(reference),
      refundAmountMajor: refundAmount,
      refundReference: refundRef,
      txn: txn as { id?: string; booking_id?: string | null; amount?: number; metadata?: Record<string, unknown> },
      reason: "paystack_refund",
    });
  }

  console.log(`Refund processed for transaction ${reference} — ${refundAmount}`);

  if (refundAmount > 0) {
    void import("@/lib/integrations/slack/ops-triggers")
      .then(({ slackNotifyHighValueRefund }) =>
        slackNotifyHighValueRefund({
          refundId: refundRef,
          bookingId: (txn as { booking_id?: string | null } | null)?.booking_id ?? null,
          amountMajor: refundAmount,
          stage: "processed",
          reason: "paystack_refund.processed",
        }),
      )
      .catch(() => undefined);
  }
}

async function handleRefundFailed(data: Record<string, unknown>, supabase: SupabaseClient) {
  const reference = data?.transaction_reference || data?.reference;
  const refundReference = data?.refund_reference || data?.id;
  const reason = data?.message || data?.gateway_response || "Refund failed";

  if (!reference) {
    console.log("Refund failed event missing transaction reference");
    return;
  }

  // Record failed refund for audit
  await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference: String(refundReference || reference),
    amount: 0,
    fees: 0,
    net_amount: 0,
    status: "failed",
    provider: "paystack",
    transaction_type: "refund",
    metadata: {
      original_reference: reference,
      refund_reference: refundReference,
      failure_reason: reason,
      paystack_data: data,
    },
    created_at: new Date().toISOString(),
  });

  try {
    const { data: originalTxn } = await supabase
      .from("payment_transactions")
      .select("booking_id, metadata")
      .eq("reference", String(reference))
      .maybeSingle();
    const { sendToUser } = await import("@/lib/notifications/onesignal");

    const bookingId = (originalTxn as { booking_id?: string | null } | null)?.booking_id ?? null;
    const metadata = ((originalTxn as { metadata?: Record<string, unknown> } | null)?.metadata) ?? {};
    if (bookingId) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("customer_id")
        .eq("id", bookingId)
        .maybeSingle();
      const customerId = (booking as { customer_id?: string } | null)?.customer_id;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Failed",
            message: "Your refund could not be processed. Please contact support.",
            data: { type: "refund_failed", booking_id: bookingId },
            url: `/bookings/${bookingId}`,
          },
          ["push"],
          { appType: "customer" },
        );
      }
    } else if (metadata?.product_order_id) {
      const { data: order } = await (supabase.from("product_orders") as any)
        .select("customer_id, id")
        .eq("id", metadata.product_order_id)
        .maybeSingle();
      const customerId = (order as { customer_id?: string } | null)?.customer_id;
      if (customerId) {
        await sendToUser(
          customerId,
          {
            title: "Refund Failed",
            message: "Your refund could not be processed. Please contact support.",
            data: { type: "refund_failed", product_order_id: metadata.product_order_id },
            url: "/product-orders",
          },
          ["push"],
          { appType: "customer" },
        );
      }
    }
  } catch (notifError) {
    console.error("Failed to send refund failed notification:", notifError);
  }

  console.log(`Refund failed for transaction ${reference}: ${reason}`);
}
