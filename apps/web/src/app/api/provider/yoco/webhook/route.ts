import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { YOCO_WEBHOOK_EVENTS } from "@/lib/payments/yoco";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

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

    const supabase = await getSupabaseServer(request);
    const event = JSON.parse(body);

    // Verify webhook signature
    // Get webhook secret from database (stored per provider or globally)
    // For now, we'll verify against provider's webhook_secret
    const { data: webhookConfig } = await supabase
      .from("provider_yoco_webhooks")
      .select("webhook_secret, provider_id")
      .eq("webhook_id", webhookId)
      .single();

    if (!webhookConfig) {
      const globalWebhookSecret = process.env.YOCO_WEBHOOK_SECRET;
      if (!globalWebhookSecret) {
        console.error("No webhook secret configured for Yoco");
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 503 }
        );
      }

      const hash = crypto
        .createHmac("sha256", globalWebhookSecret)
        .update(body)
        .digest("hex");

      const sigBuf = Buffer.from(signature, "hex");
      const hashBuf = Buffer.from(hash, "hex");
      if (sigBuf.length !== hashBuf.length || !crypto.timingSafeEqual(sigBuf, hashBuf)) {
        console.error("Invalid Yoco webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    } else {
      type WebhookConfigRow = { webhook_secret?: string; provider_id?: string };
      const secret = (webhookConfig as WebhookConfigRow).webhook_secret;
      if (!secret) {
        console.error("Yoco webhook secret is empty in database — rejecting");
        return NextResponse.json(
          { error: "Webhook secret not configured" },
          { status: 503 }
        );
      }

      const hash = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      const sigBuf = Buffer.from(signature, "hex");
      const hashBuf = Buffer.from(hash, "hex");
      if (sigBuf.length !== hashBuf.length || !crypto.timingSafeEqual(sigBuf, hashBuf)) {
        console.error("Invalid Yoco webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    const { data: insertedEvent } = await supabase
      .from("provider_yoco_webhook_events")
      .insert({
        webhook_id: webhookId,
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
  const amount = data.amount as number | undefined;
  const currency = data.currency as string | undefined;
  const status = data.status as string | undefined;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;

  if (!id || !metadata?.provider_id) {
    console.error("Missing payment ID or provider ID in webhook data");
    return;
  }

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
      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabaseAdmin = await getSupabaseAdmin();
      
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
  const amount = (data.amount as number) ?? 0;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const originalAmount = data.original_amount as number | undefined;
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

  const currency = (data.currency as string) ?? lastResortCurrency;

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
      amount,
      currency: currency || lastResortCurrency,
      status: "successful",
      created_at: new Date().toISOString(),
    });

  if (yocoPaymentId) {
    await supabase
      .from("provider_yoco_payments")
      .update({
        refund_status: amount === originalAmount ? "fully_refunded" : "partially_refunded",
        refund_amount: amount,
        updated_at: new Date().toISOString(),
      })
      .eq("yoco_payment_id", yocoPaymentId);
  }

  // Sync to booking: create booking_refund so booking total_refunded and payment_status stay in sync
  if (bookingId && amount > 0) {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabaseAdmin = await getSupabaseAdmin();

    // Idempotency: skip if we already recorded this Yoco refund as a booking_refund
    const { data: existingRefund } = await supabaseAdmin
      .from("booking_refunds")
      .select("id")
      .eq("refund_provider_id", id)
      .maybeSingle();
    if (existingRefund) {
      return;
    }

    const amountInCurrency = amount / 100; // Yoco amounts are in cents

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

      const { data: bookingRow } = await supabaseAdmin
        .from("bookings")
        .select("tenant_id, provider_id")
        .eq("id", bookingId)
        .maybeSingle();
      const yocoRefundFinanceTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
        tenant_id: (bookingRow as { tenant_id?: string | null } | null)?.tenant_id,
        provider_id:
          (bookingRow as { provider_id?: string | null } | null)?.provider_id ?? providerId,
      });
      const { error: yocoFinanceErr } = await supabaseAdmin.from("finance_transactions").insert({
        tenant_id: yocoRefundFinanceTenantId,
        booking_id: bookingId,
        provider_id:
          (bookingRow as { provider_id?: string | null } | null)?.provider_id ?? providerId,
        transaction_type: "refund",
        amount: -amountInCurrency,
        fees: 0,
        commission: 0,
        net: -amountInCurrency,
        description: `Yoco card refund (${id})`,
        created_at: new Date().toISOString(),
      });
      if (yocoFinanceErr) {
        console.error("Yoco webhook: finance ledger insert after booking_refund:", yocoFinanceErr);
      }
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
