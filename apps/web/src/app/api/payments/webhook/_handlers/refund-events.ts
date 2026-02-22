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

async function handleRefundProcessed(data: any, supabase: SupabaseClient) {
  const reference = data?.transaction_reference || data?.reference;
  const refundAmount = data?.amount ? convertFromSmallestUnit(data.amount) : 0;
  const refundReference = data?.refund_reference || data?.id;

  if (!reference) {
    console.log("Refund processed event missing transaction reference");
    return;
  }

  // Find the original payment transaction
  const { data: txn } = await (supabase.from("payment_transactions") as any)
    .select("id, booking_id")
    .eq("reference", reference)
    .eq("status", "success")
    .maybeSingle();

  // Record refund transaction
  await (supabase.from("payment_transactions") as any).insert({
    booking_id: txn?.booking_id || null,
    reference: String(refundReference || reference),
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

  // If linked to a booking, update its payment status
  if (txn?.booking_id) {
    await (supabase.from("bookings") as any)
      .update({
        payment_status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", txn.booking_id);

    // Finance ledger entry
    await (supabase.from("finance_transactions") as any).insert({
      booking_id: txn.booking_id,
      provider_id: null,
      transaction_type: "refund",
      amount: refundAmount,
      fees: 0,
      commission: 0,
      net: -refundAmount,
      description: `Refund processed (${reference})`,
      created_at: new Date().toISOString(),
    });
  }

  console.log(`Refund processed for transaction ${reference} — ${refundAmount}`);
}

async function handleRefundFailed(data: any, supabase: SupabaseClient) {
  const reference = data?.transaction_reference || data?.reference;
  const refundReference = data?.refund_reference || data?.id;
  const reason = data?.message || data?.gateway_response || "Refund failed";

  if (!reference) {
    console.log("Refund failed event missing transaction reference");
    return;
  }

  // Record failed refund for audit
  await (supabase.from("payment_transactions") as any).insert({
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

  console.log(`Refund failed for transaction ${reference}: ${reason}`);
}
