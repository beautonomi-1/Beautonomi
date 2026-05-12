import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { YOCO_WEBHOOK_EVENTS } from "@/lib/payments/yoco";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { applyPosProductStockDecrements } from "@/lib/provider-sales/pos-product-stock";

function yocoAmountCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const amount = (value as { amount?: unknown }).amount;
    if (typeof amount === "number" && Number.isFinite(amount)) return amount;
  }
  return 0;
}

function yocoCurrency(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.currency === "string" && data.currency.trim()) return data.currency.trim();
  const amount = data.amount;
  if (amount && typeof amount === "object") {
    const currency = (amount as { currency?: unknown }).currency;
    if (typeof currency === "string" && currency.trim()) return currency.trim();
  }
  return fallback;
}

function normalizeYocoStatus(status: unknown): "successful" | "failed" | "pending" {
  const value = String(status ?? "").toLowerCase();
  if (["successful", "success", "succeeded", "completed", "paid"].includes(value)) return "successful";
  if (["failed", "declined", "cancelled", "canceled", "voided"].includes(value)) return "failed";
  return "pending";
}
/**
 * POST /api/provider/yoco/webhook
 *
 * Yoco webhook handler for payment and refund notifications.
 * According to Yoco API: https://developer.yoco.com/api-reference/checkout-api/webhook-events
 *
 * Requires provider_yoco_webhooks and provider_yoco_webhook_events (migration 302).
 *
 * Webhook events:
 * - payment.notification
 * - refund.notification.success.full
 * - refund.notification.success.partial
 * - refund.notification.failure.full
 * - refund.notification.failure.partial
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-yoco-signature");
    const webhookId = request.headers.get("x-yoco-webhook-id");

    if (!signature || !webhookId) {
      console.error("Missing Yoco webhook signature or ID");
      return NextResponse.json(
        { error: "Missing signature or webhook ID" },
        { status: 400 }
      );
    }

    // Yoco webhooks are server-to-server callbacks, so there is no provider session.
    // Use service role after signature verification setup lookup so accounting writes are not blocked by RLS.
    const supabase = getSupabaseAdmin();

    // Resolve webhook config (and secret) BEFORE parsing the payload — verify-then-parse is
    // the correct security order so a malformed body never runs business logic.
    const { data: webhookConfig } = await supabase
      .from("provider_yoco_webhooks")
      .select("webhook_secret, provider_id")
      .eq("webhook_id", webhookId)
      .single();

    type WebhookConfigRow = { webhook_secret?: string; provider_id?: string };

    let webhookSecret: string | undefined;
    let webhookProviderId: string | null = null;

    if (!webhookConfig) {
      webhookSecret = process.env.YOCO_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error("No webhook secret configured for Yoco");
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 503 },
        );
      }
    } else {
      const configRow = webhookConfig as WebhookConfigRow;
      if (!configRow.webhook_secret) {
        console.error("Yoco webhook secret is empty in database — rejecting");
        return NextResponse.json(
          { error: "Webhook secret not configured" },
          { status: 503 },
        );
      }
      webhookSecret = configRow.webhook_secret;
      webhookProviderId = configRow.provider_id ?? null;
    }

    const hash = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const hashBuf = Buffer.from(hash, "hex");
    if (sigBuf.length !== hashBuf.length || !crypto.timingSafeEqual(sigBuf, hashBuf)) {
      console.error("Invalid Yoco webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Signature verified — safe to parse body.
    const event = JSON.parse(body);

    const { data: insertedEvent } = await supabase
      .from("provider_yoco_webhook_events")
      .insert({
        webhook_id: webhookId,
        ...(webhookProviderId ? { provider_id: webhookProviderId } : {}),
        event_type: event.type,
        payload: event,
        signature,
        status: "received",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const eventRowId = (insertedEvent as { id?: string } | null)?.id;

    // Handle different event types
    try {
      const { type, data } = event;

      switch (type) {
        case YOCO_WEBHOOK_EVENTS.PAYMENT_NOTIFICATION:
          await handlePaymentNotification(data, supabase);
          break;

        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_SUCCESS_FULL:
        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_SUCCESS_PARTIAL:
          await handleRefundSuccess(data, supabase);
          break;

        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_FAILURE_FULL:
        case YOCO_WEBHOOK_EVENTS.REFUND_NOTIFICATION_FAILURE_PARTIAL:
          await handleRefundFailure(data, supabase);
          break;

        default:
          console.log(`Unhandled Yoco webhook event type: ${type}`);
      }

      if (eventRowId) {
        await supabase
          .from("provider_yoco_webhook_events")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventRowId);
      }
    } catch (error) {
      console.error("Error processing Yoco webhook:", error);

      if (eventRowId) {
        await supabase
          .from("provider_yoco_webhook_events")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : String(error),
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventRowId);
      }

      // Return 500 so Yoco retries delivery for financial events
      return NextResponse.json(
        { received: false, error: error instanceof Error ? error.message : "Processing error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Unexpected error in /api/provider/yoco/webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentNotification(
  data: Record<string, unknown>,
  supabase: SupabaseClient
) {
  const id = data.id as string | undefined;
  const amount = yocoAmountCents(data.amount);
  const currency = yocoCurrency(data, LAST_RESORT_CURRENCY);
  const status = normalizeYocoStatus(data.status);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;

  if (!id || !metadata?.provider_id) {
    console.error("Missing payment ID or provider ID in webhook data");
    return;
  }

  const { data: yocoPaymentRow } = await supabase
    .from("provider_yoco_payments")
    .select("sale_id")
    .eq("yoco_payment_id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("provider_yoco_payments")
    .update({
      status: status === "successful" ? "successful" : status === "failed" ? "failed" : "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("yoco_payment_id", id);

  if (error) {
    console.error("Error updating payment status:", error);
  }

  const saleId = ((metadata?.sale_id as string | undefined) ?? (yocoPaymentRow as { sale_id?: string | null } | null)?.sale_id ?? null);
  if (status === "successful" && saleId) {
    const { data: saleBefore } = await supabase
      .from("sales")
      .select("id, payment_status")
      .eq("id", saleId)
      .maybeSingle();
    const shouldDecrementStock = (saleBefore as { payment_status?: string } | null)?.payment_status !== "completed";

    const { error: saleError } = await supabase
      .from("sales")
      .update({
        payment_status: "completed",
        payment_provider: "yoco",
        payment_provider_id: id,
        payment_method: "yoco",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .neq("payment_status", "completed");
    if (saleError) {
      console.error("Yoco webhook: failed to mark POS sale completed:", saleError);
      throw new Error(`Failed to complete POS sale for Yoco payment ${id}: ${saleError.message}`);
    }
    if (shouldDecrementStock) {
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("item_type, item_id, product_variant_id, quantity")
        .eq("sale_id", saleId);
      const stockItems = (saleItems || []).map((row: Record<string, unknown>) => ({
        type: row.item_type as string,
        item_id: (row.item_id as string | null) ?? null,
        product_variant_id: (row.product_variant_id as string | null) ?? null,
        quantity: Number(row.quantity ?? 1),
      }));
      try {
        await applyPosProductStockDecrements(supabase, stockItems);
      } catch (stockError) {
        // Payment is already captured; leave the sale complete and surface stock drift for ops.
        console.error("Yoco webhook: POS sale completed but stock decrement failed:", stockError);
      }
    }
  } else if (status === "failed" && saleId) {
    const { error: saleError } = await supabase
      .from("sales")
      .update({
        payment_status: "failed",
        payment_provider: "yoco",
        payment_provider_id: id,
        payment_method: "yoco",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .eq("payment_status", "pending");
    if (saleError) {
      console.error("Yoco webhook: failed to mark POS sale failed:", saleError);
    }
  }

  // If payment successful, create booking_payment record
  // This will trigger automatic creation of finance_transactions via database trigger
  const bookingId = metadata?.appointment_id as string | undefined;
  if (status === "successful" && bookingId) {
    const amountInCurrency = amount / 100; // Yoco uses cents
    
    // Get booking details
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, tenant_id, booking_number, provider_id, total_amount, payment_status, location_id, location_type")
      .eq("id", bookingId)
      .single();
    
    // If booking is missing location_id and it's an at_salon booking, set it to provider's first location
    if (booking && !booking.location_id && booking.location_type === "at_salon") {
      const supabaseAdmin = getSupabaseAdmin();
      
      const { data: providerLocations } = await supabaseAdmin
        .from("provider_locations")
        .select("id")
        .eq("provider_id", booking.provider_id)
        .order("created_at", { ascending: true })
        .limit(1);
      
      if (providerLocations && providerLocations.length > 0) {
        const defaultLocationId = providerLocations[0].id;
        const { error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({ location_id: defaultLocationId })
          .eq("id", bookingId);
        
        if (!updateError) {
          console.log(`Updated booking ${bookingId} with location_id ${defaultLocationId} via Yoco webhook`);
        } else {
          console.warn(`Failed to update location_id for booking ${bookingId}:`, updateError);
        }
      }
    }
    
    if (booking && booking.payment_status !== "paid") {
      // Idempotency: skip if we've already recorded this Yoco payment
      const { data: existingPayment } = await supabase
        .from("booking_payments")
        .select("id")
        .eq("payment_provider", "yoco")
        .eq("payment_provider_id", id)
        .maybeSingle();
      if (existingPayment) {
        console.log(`Yoco payment ${id} already recorded, skipping (idempotent)`);
        return;
      }

      console.log(`Creating booking_payment for booking ${booking.booking_number} via Yoco terminal`);
      
      // Create booking_payment record (this will trigger finance_transactions creation via migration 169)
      const yocoBookingTenantId = (booking as { tenant_id?: string | null }).tenant_id;
      const { error: paymentError } = await supabase
        .from("booking_payments")
        .insert({
          booking_id: bookingId,
          ...(yocoBookingTenantId ? { tenant_id: yocoBookingTenantId } : {}),
          amount: amountInCurrency,
          payment_method: "card",
          payment_provider: "yoco",
          payment_provider_id: id, // Yoco payment ID
          payment_provider_data: {
            yoco_payment_id: id,
            device_id: metadata.device_id,
            currency: currency,
          },
          status: "completed",
          notes: `Yoco card terminal payment - ${id}`,
          created_by: metadata.processed_by || null,
          created_at: new Date().toISOString(),
        });
      
      if (paymentError) {
        if (paymentError.code === "23505") {
          console.log(`Yoco payment ${id} was recorded concurrently, skipping duplicate`);
          return;
        }
        console.error("Error creating booking_payment:", paymentError);
        throw new Error(`Failed to create booking_payment for Yoco payment ${id}: ${paymentError.message}`);
      } else {
        console.log(`✅ Booking payment created for ${booking.booking_number} via Yoco terminal. Finance transactions will be auto-created by trigger.`);
        // The trigger (migration 169) will automatically:
        // 1. Create finance_transactions (payment & provider_earnings)
        // 2. Update booking.payment_status to "paid"
        // 3. Update booking.total_paid
      }
    } else if (booking && booking.payment_status === "paid") {
      console.log(`Booking ${booking.booking_number} is already marked as paid, skipping`);
    }
  }

  // Send notification
  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    if (metadata.processed_by) {
      const failedMessage =
        status === "failed"
          ? "Card declined – ask customer to try another card."
          : `Payment failed for amount ${(amount / 100).toFixed(2)} ${currency}`;
      await sendToUser(
        String(metadata.processed_by ?? ""),
        {
          title: status === "successful" ? "Payment Successful" : "Payment Failed",
          message:
            status === "successful"
              ? `Payment completed for amount ${(amount / 100).toFixed(2)} ${currency}`
              : failedMessage,
          data: {
            type: "yoco_payment",
            payment_id: id,
            status,
          },
        },
        ["push"],
        { appType: "provider" }
      );
    }
  } catch (notifError) {
    console.error("Error sending notification:", notifError);
  }
}

async function handleRefundSuccess(
  data: Record<string, unknown>,
  supabase: SupabaseClient
) {
  const id = data.id as string | undefined;
  const amountCents = yocoAmountCents(data.amount);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const originalAmount = yocoAmountCents(data.original_amount);
  const yocoPaymentId = metadata?.payment_id as string | undefined;

  // Resolve provider_id and appointment_id from payment for RLS and booking sync
  let providerId: string | null = null;
  let bookingId: string | null = null;
  if (yocoPaymentId) {
    const { data: payment } = await supabase
      .from("provider_yoco_payments")
      .select("provider_id, appointment_id")
      .eq("yoco_payment_id", yocoPaymentId)
      .single();
    const row = payment as { provider_id?: string; appointment_id?: string } | null;
    providerId = row?.provider_id ?? null;
    bookingId = row?.appointment_id ?? null;
  }

  let lastResortCurrency: string = LAST_RESORT_CURRENCY;
  if (providerId) {
    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tid = (prow as { tenant_id?: string | null } | null)?.tenant_id;
    if (tid) {
      lastResortCurrency = (await getTenantRegionConfig(tid))?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    }
  }

  const currency = yocoCurrency(data, lastResortCurrency);

  // Idempotency: skip if refund already recorded
  if (id) {
    const { data: existingYocoRefund } = await supabase
      .from("provider_yoco_refunds")
      .select("id")
      .eq("yoco_refund_id", id)
      .maybeSingle();
    if (existingYocoRefund) {
      console.log(`Yoco refund ${id} already recorded, skipping (idempotent)`);
      return;
    }
  }

  await supabase
    .from("provider_yoco_refunds")
    .insert({
      provider_id: providerId,
      yoco_refund_id: id,
      payment_id: yocoPaymentId,
      amount: amountCents,
      currency: currency || lastResortCurrency,
      status: "successful",
      created_at: new Date().toISOString(),
    });

  if (yocoPaymentId) {
    await supabase
      .from("provider_yoco_payments")
      .update({
        refund_status: amountCents === originalAmount ? "fully_refunded" : "partially_refunded",
        refund_amount: amountCents,
        updated_at: new Date().toISOString(),
      })
      .eq("yoco_payment_id", yocoPaymentId);
  }

  // Sync to booking: create booking_refund so booking total_refunded and payment_status stay in sync
  if (bookingId && amountCents > 0) {
    const supabaseAdmin = getSupabaseAdmin();

    // Idempotency: skip if we already recorded this Yoco refund as a booking_refund
    const { data: existingRefund } = await supabaseAdmin
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", id)
      .maybeSingle();
    if (existingRefund) {
      return;
    }

    const amountInCurrency = amountCents / 100; // Yoco amounts are in cents

    // Optionally link to the booking_payment that was created when the Yoco payment succeeded
    const { data: bookingPayment } = await supabaseAdmin
      .from("booking_payments")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("payment_provider_id", yocoPaymentId)
      .maybeSingle();

    const { error: refundError } = await supabaseAdmin.from("booking_refunds").insert({
      booking_id: bookingId,
      payment_id: (bookingPayment as { id?: string } | null)?.id ?? null,
      amount: amountInCurrency,
      reason: "Yoco card refund",
      refund_method: "original",
      refund_provider_id: id,
      status: "completed",
      notes: `Yoco refund ${id} (payment ${yocoPaymentId})`,
    });

    if (refundError) {
      console.error("Yoco webhook: failed to create booking_refund:", refundError);
    } else {
      console.log(`Yoco refund ${id} synced to booking ${bookingId} (booking_refund created).`);
      // finance_transactions row is written by trigger
      // `create_finance_ledger_from_booking_refund` (migration 490) via the
      // booking_refunds insert above — no app-side insert (B1).
    }
  }
}

async function handleRefundFailure(
  data: Record<string, unknown>,
  supabase: SupabaseClient
) {
  const id = data.id as string | undefined;
  const err = data.error as { message?: string } | undefined;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const yocoPaymentId = metadata?.payment_id as string | undefined;

  let providerId: string | null = null;
  if (yocoPaymentId) {
    const { data: payment } = await supabase
      .from("provider_yoco_payments")
      .select("provider_id")
      .eq("yoco_payment_id", yocoPaymentId)
      .single();
    providerId = (payment as { provider_id?: string } | null)?.provider_id ?? null;
  }

  await supabase
    .from("provider_yoco_refunds")
    .insert({
      provider_id: providerId,
      yoco_refund_id: id,
      payment_id: yocoPaymentId,
      status: "failed",
      error_message: err?.message ?? "Refund failed",
      created_at: new Date().toISOString(),
    });
}
