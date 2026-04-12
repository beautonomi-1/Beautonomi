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
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

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
  const refundAmount = data?.amount != null ? convertFromSmallestUnit(Number(data.amount)) : 0;
  const refundReference = data?.refund_reference || data?.id;

  if (!reference) {
    console.log("Refund processed event missing transaction reference");
    return;
  }

  // Find the original payment transaction (include metadata to detect product orders)
  const { data: txn } = await supabase.from("payment_transactions")
    .select("id, booking_id, metadata")
    .eq("reference", reference)
    .eq("status", "success")
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
    // Booking-linked refund: update booking payment status and create ledger entry
    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("provider_id, tenant_id")
      .eq("id", txn.booking_id)
      .maybeSingle();
    const providerId =
      (bookingRow as { provider_id?: string | null } | null)?.provider_id ?? null;
    const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: (bookingRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
      provider_id: providerId,
    });

    await supabase.from("bookings")
      .update({
        payment_status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", txn.booking_id);

    await supabase.from("finance_transactions").insert({
      booking_id: txn.booking_id,
      provider_id: providerId,
      tenant_id: refundLedgerTenantId,
      transaction_type: "refund",
      amount: refundAmount,
      fees: 0,
      commission: 0,
      net: -refundAmount,
      description: `Refund processed (${reference})`,
      created_at: new Date().toISOString(),
    });
  } else {
    // Non-booking refund: check if this is a product order refund via metadata
    const metadata = (txn as any)?.metadata ?? {};
    const productOrderId = metadata?.product_order_id ?? null;

    if (productOrderId) {
      const { data: orderRow } = await supabase
        .from("product_orders")
        .select("id, provider_id, tenant_id, order_number, payment_status")
        .eq("id", productOrderId)
        .maybeSingle();

      if (orderRow) {
        const providerId = (orderRow as any).provider_id ?? null;
        const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: (orderRow as any).tenant_id ?? null,
          provider_id: providerId,
        });

        await (supabase.from("product_orders") as any)
          .update({
            payment_status: "refunded",
            updated_at: new Date().toISOString(),
          })
          .eq("id", productOrderId);

        await supabase.from("finance_transactions").insert({
          booking_id: null,
          provider_id: providerId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          amount: refundAmount,
          fees: 0,
          commission: 0,
          net: -refundAmount,
          description: `Product order refund (${(orderRow as any).order_number ?? productOrderId})`,
          created_at: new Date().toISOString(),
        });
      }
    } else if (txn) {
      // Generic non-booking, non-product-order refund: still record ledger for completeness
      // Try to resolve provider from the original payment_transactions metadata
      const origMeta = (txn as any)?.metadata ?? {};
      const origProviderId = origMeta?.provider_id ?? null;
      if (origProviderId) {
        const refundLedgerTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: null,
          provider_id: origProviderId,
        });
        await supabase.from("finance_transactions").insert({
          booking_id: null,
          provider_id: origProviderId,
          tenant_id: refundLedgerTenantId,
          transaction_type: "refund",
          amount: refundAmount,
          fees: 0,
          commission: 0,
          net: -refundAmount,
          description: `Refund processed (${reference})`,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  console.log(`Refund processed for transaction ${reference} — ${refundAmount}`);
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

  console.log(`Refund failed for transaction ${reference}: ${reason}`);
}
