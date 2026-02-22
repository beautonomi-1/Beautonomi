import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { handleChargeSuccess, handleChargeFailed } from "./_handlers/charge-success";
import { handleSubscriptionEvent } from "./_handlers/subscription-events";
import { handleTransferEvent } from "./_handlers/transfer-events";
import { handleRefundEvent } from "./_handlers/refund-events";
import type { PaystackEvent } from "./_handlers/shared";

/**
 * POST /api/payments/webhook
 *
 * Paystack webhook handler — thin router.
 *
 * 1. Verifies the HMAC-SHA512 signature
 * 2. Parses the event type from the body
 * 3. Performs idempotency check (webhook_events table)
 * 4. Routes to the appropriate handler based on event type
 * 5. Marks the event as processed / failed
 * 6. Returns 200 for unhandled event types
 */
export async function POST(request: Request) {
  try {
    // ── 1. Read body & verify signature ─────────────────────────────────────
    const body = await request.text();
    const signature = request.headers.get("x-paystack-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const paystackSecretKey = await getPaystackSecretKey();

    const hash = crypto
      .createHmac("sha512", paystackSecretKey)
      .update(body)
      .digest("hex");

    if (hash !== signature) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // ── 2. Parse event ──────────────────────────────────────────────────────
    const event: PaystackEvent = JSON.parse(body);
    const { event: eventType, data } = event;

    if (!eventType || !data) {
      console.error("Invalid webhook payload structure");
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // ── 3. Idempotency check ────────────────────────────────────────────────
    const supabase = getSupabaseAdmin();
    const eventId = event.id || data.id || data.reference;

    if (eventId) {
      const { error: insertError } = await supabase
        .from("webhook_events")
        .insert({
          event_id: eventId,
          source: "paystack",
          event_type: eventType,
          payload: event,
          status: "processing",
          processed_at: null,
        })
        .select("id, status")
        .single();

      if (insertError) {
        if (
          insertError.code === "23505" ||
          insertError.message?.includes("unique") ||
          insertError.message?.includes("duplicate")
        ) {
          const { data: existingEvent } = await supabase
            .from("webhook_events")
            .select("id, status")
            .eq("event_id", eventId)
            .eq("source", "paystack")
            .single();

          if (existingEvent) {
            if ((existingEvent as any).status === "processed") {
              console.log(`Event ${eventId} already processed, skipping`);
              return NextResponse.json({ received: true, duplicate: true });
            } else if ((existingEvent as any).status === "processing") {
              console.log(`Event ${eventId} is being processed by another instance`);
              return NextResponse.json({ received: true, processing: true });
            }
          }
        }

        throw insertError;
      }
    }

    // ── 4. Route to handler ─────────────────────────────────────────────────
    let processingError: Error | null = null;
    try {
      let response: NextResponse;

      if (eventType === "charge.success") {
        response = await handleChargeSuccess(event, supabase);
      } else if (eventType === "charge.failed") {
        response = await handleChargeFailed(event, supabase);
      } else if (eventType.startsWith("transfer.")) {
        response = await handleTransferEvent(event, supabase);
      } else if (
        eventType === "subscription.create" ||
        eventType === "subscription.disable" ||
        eventType === "subscription.enable" ||
        eventType === "subscription.not_renew" ||
        eventType === "invoice.create" ||
        eventType === "invoice.payment_failed"
      ) {
        response = await handleSubscriptionEvent(event, supabase);
      } else if (eventType.startsWith("refund.")) {
        response = await handleRefundEvent(event, supabase);
      } else {
        console.log(`Unhandled event type: ${eventType}`);
        response = NextResponse.json({ received: true });
      }

      // ── 5a. Mark as processed ─────────────────────────────────────────────
      if (eventId) {
        await (supabase.from("webhook_events") as any)
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("event_id", eventId)
          .eq("source", "paystack");
      }

      return response;
    } catch (error) {
      processingError =
        error instanceof Error ? error : new Error(String(error));
      console.error("Error processing webhook:", processingError);

      // ── 5b. Mark as failed ────────────────────────────────────────────────
      if (eventId) {
        await (supabase.from("webhook_events") as any)
          .update({
            status: "failed",
            error_message: processingError.message,
            processed_at: new Date().toISOString(),
          })
          .eq("event_id", eventId)
          .eq("source", "paystack");
      }

      // Add to reconciliation queue for charge events
      if (eventType === "charge.success" || eventType === "charge.failed") {
        const bookingId = event?.data?.metadata?.booking_id;
        const reference = event?.data?.reference;

        if (bookingId && reference) {
          try {
            await (supabase.from("payment_reconciliation_queue") as any).insert({
              booking_id: bookingId,
              payment_reference: reference,
              payment_provider: "paystack",
              status: "pending",
              error_message: processingError.message,
              attempt_count: 1,
              next_retry_at: new Date(
                Date.now() + 5 * 60 * 1000,
              ).toISOString(),
            });
          } catch (reconError) {
            console.error(
              "Failed to add to reconciliation queue:",
              reconError,
            );
          }
        }
      }

      // Still return 200 to Paystack (we'll retry manually)
      return NextResponse.json({
        received: true,
        error: processingError.message,
      });
    }
  } catch (error) {
    console.error("Unexpected error in /api/payments/webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
