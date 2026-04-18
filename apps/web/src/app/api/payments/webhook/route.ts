import { NextResponse } from "next/server";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { handleChargeSuccess, handleChargeFailed } from "./_handlers/charge-success";
import { handleSubscriptionEvent } from "./_handlers/subscription-events";
import { handleTransferEvent } from "./_handlers/transfer-events";
import { handleRefundEvent } from "./_handlers/refund-events";
import type { PaystackEvent } from "./_handlers/shared";
import { tryRecordPaymentWebhookEvent } from "@/lib/payment/webhook-idempotency";
import {
  extractBookingIdFromPaystackPayloadData,
  resolvePaymentWebhookTenantId,
} from "@/lib/payment/resolve-payment-webhook-tenant";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { sanitizeWebhookPayload } from "@/lib/payment/webhook-payload-sanitizer";

const MAX_WEBHOOK_BODY_BYTES = 1_000_000; // 1 MB safety cap

/**
 * Wave 2.2 (audit 2026-04 final 100/100): unified Sentry capture for the
 * payments webhook surface. Tags every report with
 * `webhook.handler.failure` so an alert rule can fire when this counter
 * spikes, which is the canonical money-movement failure signal.
 */
function captureWebhookFailure(
  err: unknown,
  context: {
    stage: string;
    eventType?: string | null;
    eventId?: string | null;
    tenantId?: string | null;
  },
): void {
  try {
    Sentry.captureException(err, {
      tags: {
        surface: "payments.webhook",
        "webhook.handler.failure": "true",
        webhook_stage: context.stage,
        ...(context.eventType ? { event_type: context.eventType } : {}),
        ...(context.eventId ? { event_id: context.eventId } : {}),
        ...(context.tenantId ? { tenant_id: context.tenantId } : {}),
      },
      level: "error",
    });
  } catch {
    // Sentry must never throw out of the webhook path
  }
}

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
  return withRouteMetrics(
    request,
    "/api/payments/webhook",
    "POST",
    async () => {
      try {
        // ── 1. Read body & verify signature ─────────────────────────────────────
        const body = await request.text();
        const signature = request.headers.get("x-paystack-signature");
        if (body.length > MAX_WEBHOOK_BODY_BYTES) {
          return NextResponse.json({ error: "Payload too large" }, { status: 413 });
        }

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const tenant = await resolveTenantFromRequest(request);
    const paystackSecretKey = await getPaystackSecretKey({ tenantId: tenant?.id ?? null });

    const hash = crypto
      .createHmac("sha512", paystackSecretKey)
      .update(body)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const hashBuf = Buffer.from(hash, "hex");
    if (sigBuf.length !== hashBuf.length || !crypto.timingSafeEqual(sigBuf, hashBuf)) {
      captureWebhookFailure(new Error("Invalid webhook signature"), {
        stage: "verify_signature",
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // ── 2. Parse event ──────────────────────────────────────────────────────
    const event: PaystackEvent = JSON.parse(body);
    const { event: eventType, data } = event;

    if (!eventType || !data) {
      captureWebhookFailure(new Error("Invalid webhook payload structure"), {
        stage: "parse_event",
      });
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // ── 3. Idempotency check ────────────────────────────────────────────────
    const supabase = getSupabaseAdmin();
    const eventId = event.id || data.id || data.reference;
    const { data: defaultTenant } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();

    const paymentWebhookTenantId = await resolvePaymentWebhookTenantId(supabase, {
      hostTenantId: tenant?.id ?? null,
      bookingIdFromPayload: extractBookingIdFromPaystackPayloadData(data),
      defaultTenantId: (defaultTenant?.id as string | undefined) ?? null,
    });

    if (eventId) {
      const sanitizedPayload = sanitizeWebhookPayload(event);
      // B3: use the try_acquire_webhook_event_lease RPC which (a) inserts the
      // row if new, (b) reclaims a stale "processing" lease (>5 min) left
      // behind by a dead worker, and (c) refuses when another live worker
      // still holds the lease. This prevents money-movement events from
      // being permanently stuck on `processing`.
      const { data: leaseRow, error: leaseError } = await (supabase.rpc as any)(
        "try_acquire_webhook_event_lease",
        {
          p_event_id: String(eventId),
          p_source: "paystack",
          p_event_type: eventType,
          p_payload: sanitizedPayload,
          p_lease_seconds: 300,
        },
      );

      if (leaseError) {
        console.error("try_acquire_webhook_event_lease failed:", leaseError);
        captureWebhookFailure(leaseError, {
          stage: "lease_acquire",
          eventType,
          eventId: String(eventId),
          tenantId: paymentWebhookTenantId,
        });
        // Fall back to legacy insert so webhook processing still runs, but log
        // loudly so operators notice the lease function is missing/broken.
      }

      type LeaseRow = {
        acquired: boolean;
        already_processed: boolean;
        stale_lease_reclaimed: boolean;
        status: string;
      };
      const lease: LeaseRow | null = Array.isArray(leaseRow)
        ? ((leaseRow[0] ?? null) as LeaseRow | null)
        : ((leaseRow as LeaseRow | null) ?? null);

      if (lease) {
        if (lease.already_processed) {
          console.log(`Event ${eventId} already processed, skipping`);
          return NextResponse.json({ received: true, duplicate: true });
        }
        if (!lease.acquired) {
          console.log(
            `Event ${eventId} is being processed by another live worker (lease held)`,
          );
          // Return 200 but flag so Paystack will retry later; the stale
          // reclaim window (5 min) will let a future retry succeed if the
          // holder dies.
          return NextResponse.json({ received: true, processing: true });
        }
        if (lease.stale_lease_reclaimed) {
          console.warn(
            `Event ${eventId} lease was stale and has been reclaimed for re-processing`,
          );
        }
      } else if (leaseError) {
        // Legacy fallback path: best-effort insert, rely on unique violation.
        const { error: insertError } = await supabase
          .from("webhook_events")
          .insert({
            event_id: eventId,
            source: "paystack",
            event_type: eventType,
            payload: sanitizedPayload,
            status: "processing",
            processed_at: null,
          });
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
                return NextResponse.json({ received: true, duplicate: true });
              }
              return NextResponse.json({ received: true, processing: true });
            }
          }
          throw insertError;
        }
      }

      if (paymentWebhookTenantId) {
        try {
          await tryRecordPaymentWebhookEvent(supabase, {
            tenantId: paymentWebhookTenantId,
            provider: "paystack",
            idempotencyKey: String(eventId),
          });
        } catch {
          /* payment_webhook_events optional until migration 334 applied */
        }
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
        eventType === "subscription.expiring_cards" ||
        eventType === "invoice.create" ||
        eventType === "invoice.update" ||
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
      // Wave 2.2: this is the canonical handler-failure signal. Tagged
      // so an alert rule on tag `webhook.handler.failure=true` fires
      // immediately on every money-movement processing error.
      captureWebhookFailure(processingError, {
        stage: "handler",
        eventType,
        eventId: eventId ? String(eventId) : null,
        tenantId: paymentWebhookTenantId,
      });

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

      // Add to reconciliation queue for all charge/transfer events as an audit trail.
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
          captureWebhookFailure(reconError, {
            stage: "reconciliation_enqueue",
            eventType,
            eventId: eventId ? String(eventId) : null,
            tenantId: paymentWebhookTenantId,
          });
        }
      }

      // For critical money-movement events (charge.success, transfer.*), return 500 so
      // Paystack retries automatically. All handlers for these event types are idempotent
      // (they check for existing records before inserting), so retries are safe.
      // For informational or non-critical events, return 200 to stop retry loops.
      const RETRYABLE_EVENTS = ["charge.success", "transfer.success", "transfer.failed", "transfer.reversed", "refund.processed"];
      if (RETRYABLE_EVENTS.includes(eventType) || eventType.startsWith("transfer.")) {
        return NextResponse.json(
          { received: false, error: processingError.message },
          { status: 500 }
        );
      }

      // Non-critical events: acknowledge to stop retries, reconcile manually via queue.
      return NextResponse.json({
        received: true,
        error: processingError.message,
      });
        }
      } catch (error) {
        console.error("Unexpected error in /api/payments/webhook:", error);
        captureWebhookFailure(error, { stage: "outer_catch" });
        return NextResponse.json(
          { error: "Webhook processing failed" },
          { status: 500 },
        );
      }
    },
  );
}
