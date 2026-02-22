import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import crypto from "crypto";
import { YOCO_WEBHOOK_EVENTS } from "@/lib/payments/yoco";

/**
 * POST /api/provider/yoco/webhook
 * 
 * Yoco webhook handler for payment and refund notifications
 * 
 * According to Yoco API: https://developer.yoco.com/api-reference/checkout-api/webhook-events
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
      // Try to verify with global webhook secret from env
      const globalWebhookSecret = process.env.YOCO_WEBHOOK_SECRET;
      if (globalWebhookSecret) {
        const hash = crypto
          .createHmac("sha256", globalWebhookSecret)
          .update(body)
          .digest("hex");

        if (hash !== signature) {
          console.error("Invalid Yoco webhook signature");
          return NextResponse.json(
            { error: "Invalid signature" },
            { status: 401 }
          );
        }
      } else {
        console.error("No webhook secret configured");
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 500 }
        );
      }
    } else {
      // Verify with provider-specific secret
      const hash = crypto
        .createHmac("sha256", (webhookConfig as any).webhook_secret)
        .update(body)
        .digest("hex");

      if (hash !== signature) {
        console.error("Invalid Yoco webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // Log webhook event
    await (supabase
      .from("provider_yoco_webhook_events") as any)
      .insert({
        webhook_id: webhookId,
        event_type: event.type,
        payload: event,
        signature,
        status: "received",
        created_at: new Date().toISOString(),
      });

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

      // Mark webhook as processed
      await (supabase
        .from("provider_yoco_webhook_events") as any)
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
        })
        .eq("webhook_id", webhookId);

    } catch (error) {
      console.error("Error processing Yoco webhook:", error);
      
      // Mark as failed
      await (supabase
        .from("provider_yoco_webhook_events") as any)
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
          processed_at: new Date().toISOString(),
        })
        .eq("webhook_id", webhookId);

      // Still return 200 to acknowledge receipt
      return NextResponse.json({
        received: true,
        error: error instanceof Error ? error.message : "Processing error",
      });
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

async function handlePaymentNotification(data: any, supabase: any) {
  const { id, amount, currency, status, metadata } = data;

  if (!id || !metadata?.provider_id) {
    console.error("Missing payment ID or provider ID in webhook data");
    return;
  }

  // Update payment status
  const { error } = await (supabase
    .from("provider_yoco_payments") as any)
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
  if (status === "successful" && metadata.appointment_id) {
    const bookingId = metadata.appointment_id;
    const amountInCurrency = amount / 100; // Yoco uses cents
    
    // Get booking details
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_number, provider_id, total_amount, payment_status, location_id, location_type")
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
      const { error: paymentError } = await supabase
        .from("booking_payments")
        .insert({
          booking_id: bookingId,
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
        // Fallback: Update booking directly if booking_payment creation fails
        await (supabase
          .from("bookings") as any)
          .update({
            payment_status: "paid",
            payment_date: new Date().toISOString(),
          })
          .eq("id", bookingId);
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
      await sendToUser(metadata.processed_by, {
        title: status === "successful" ? "Payment Successful" : "Payment Failed",
        message: `Payment ${status === "successful" ? "completed" : "failed"} for amount ${(amount / 100).toFixed(2)} ${currency}`,
        data: {
          type: "yoco_payment",
          payment_id: id,
          status,
        },
      });
    }
  } catch (notifError) {
    console.error("Error sending notification:", notifError);
  }
}

async function handleRefundSuccess(data: any, supabase: any) {
  const { id, amount, currency, metadata } = data;

  // Create refund record
  await (supabase
    .from("provider_yoco_refunds") as any)
    .insert({
      yoco_refund_id: id,
      payment_id: metadata?.payment_id,
      amount: amount,
      currency: currency || "ZAR",
      status: "successful",
      created_at: new Date().toISOString(),
    });

  // Update payment status
  if (metadata?.payment_id) {
    await (supabase
      .from("provider_yoco_payments") as any)
      .update({
        refund_status: amount === data.original_amount ? "fully_refunded" : "partially_refunded",
        refund_amount: amount,
        updated_at: new Date().toISOString(),
      })
      .eq("yoco_payment_id", metadata.payment_id);
  }
}

async function handleRefundFailure(data: any, supabase: any) {
  const { id, error, metadata } = data;

  // Create refund failure record
  await (supabase
    .from("provider_yoco_refunds") as any)
    .insert({
      yoco_refund_id: id,
      payment_id: metadata?.payment_id,
      status: "failed",
      error_message: error?.message || "Refund failed",
      created_at: new Date().toISOString(),
    });
}
