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

function safeParseJson(text: string): { data?: Record<string, unknown> } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Build the set of tenant ids whose Paystack secret could have signed this webhook.
 * We use the (untrusted) payload only to PICK candidate secrets — the HMAC must still
 * match, so this cannot be abused to forge events.
 */
async function resolvePaystackWebhookCandidateTenantIds(params: {
  body: string;
  hostTenantId: string | null;
}): Promise<Array<string | null>> {
  const candidates: Array<string | null> = [];
  const push = (value: string | null | undefined) => {
    const normalized = typeof value === "string" && value.trim() ? value.trim() : value === null ? null : undefined;
    if (normalized === undefined) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  push(params.hostTenantId);

  try {
    const parsed = safeParseJson(params.body);
    const data = parsed?.data && typeof parsed.data === "object" ? (parsed.data as Record<string, unknown>) : null;
    const metadata =
      data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};
    const supabase = getSupabaseAdmin();

    const metaTenantId = typeof metadata.tenant_id === "string" ? metadata.tenant_id : null;
    push(metaTenantId);

    const terminalCode =
      (typeof metadata.paystack_terminal_code === "string" && metadata.paystack_terminal_code) ||
      (typeof metadata.terminal_code === "string" && metadata.terminal_code) ||
      (metadata.virtual_terminal &&
      typeof metadata.virtual_terminal === "object" &&
      typeof (metadata.virtual_terminal as Record<string, unknown>).code === "string"
        ? ((metadata.virtual_terminal as Record<string, unknown>).code as string)
        : null) ||
      (data?.terminal &&
      typeof data.terminal === "object" &&
      typeof (data.terminal as Record<string, unknown>).code === "string"
        ? ((data.terminal as Record<string, unknown>).code as string)
        : null);
    if (terminalCode) {
      const { data: terminalRow } = await (supabase
        .from("provider_paystack_virtual_terminals") as any)
        .select("provider:providers(tenant_id)")
        .eq("terminal_code", terminalCode)
        .maybeSingle();
      push((terminalRow as { provider?: { tenant_id?: string | null } } | null)?.provider?.tenant_id ?? undefined);
    }

    const providerId = typeof metadata.provider_id === "string" ? metadata.provider_id : null;
    if (providerId) {
      const { data: providerRow } = await supabase
        .from("providers")
        .select("tenant_id")
        .eq("id", providerId)
        .maybeSingle();
      push((providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? undefined);
    }
  } catch (err) {
    console.error("[webhook] candidate tenant resolution failed:", err);
  }

  // Always include the global/env secret as a last resort.
  push(null);
  return candidates;
}

async function verifyPaystackSignatureAcrossTenants(
  body: string,
  signature: string,
  candidateTenantIds: Array<string | null>,
): Promise<boolean> {
  const sigBuf = Buffer.from(signature, "hex");
  const seenSecrets = new Set<string>();
  for (const tenantId of candidateTenantIds) {
    let secretKey: string;
    try {
      secretKey = await getPaystackSecretKey({ tenantId });
    } catch {
      continue;
    }
    if (!secretKey || seenSecrets.has(secretKey)) continue;
    seenSecrets.add(secretKey);
    const hashBuf = Buffer.from(
      crypto.createHmac("sha512", secretKey).update(body).digest("hex"),
      "hex",
    );
    if (sigBuf.length === hashBuf.length && crypto.timingSafeEqual(sigBuf, hashBuf)) {
      return true;
    }
  }
  return false;
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
    // A Paystack Virtual Terminal payment is initiated from Paystack's hosted page, so the
    // inbound webhook host may resolve to the wrong/default tenant. Paystack signs the body
    // with the secret of whichever integration owns the charge, so we must verify against
    // every plausible tenant secret (host tenant, the tenant derived from the payload's
    // terminal/provider, and the global secret) before rejecting.
    const candidateTenantIds = await resolvePaystackWebhookCandidateTenantIds({
      body,
      hostTenantId: tenant?.id ?? null,
    });
    const signatureValid = await verifyPaystackSignatureAcrossTenants(
      body,
      signature,
      candidateTenantIds,
    );
    if (!signatureValid) {
      captureWebhookFailure(new Error("Invalid webhook signature"), {
        stage: "verify_signature",
        tenantId: tenant?.id ?? null,
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
    // Prefer Paystack's top-level event id when present. Otherwise namespace by
    // event type: many Paystack payloads share the same data.id across
    // transfer.success / transfer.reversed / transfer.failed (and similarly for
    // invoice.*), and UNIQUE(event_id, source) would otherwise drop the later
    // event as a duplicate — leaving payouts stuck as completed after a bounce.
    const eventId =
      event.id ||
      (data.id != null ? `${eventType}:${data.id}` : null) ||
      (data.reference ? `${eventType}:${data.reference}` : null);
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
      } else if (eventType.startsWith("dispute.")) {
        // Paystack dispute events: log with merchant/transaction context for manual review
        const disputeData = event.data as Record<string, unknown> | null | undefined;
        const disputeTx = typeof disputeData?.transaction === "object" && disputeData?.transaction
          ? (disputeData.transaction as Record<string, unknown>)
          : null;
        const disputeRef = (disputeTx?.reference ?? disputeData?.reference) as string | undefined;
        console.warn(`[webhook] dispute event received: ${eventType}`, {
          reference: disputeRef,
          amount: (disputeData?.amount ?? disputeTx?.amount) as number | undefined,
          status: disputeData?.status as string | undefined,
          resolution: disputeData?.resolution as string | undefined,
          eventId,
        });
        // Chargeback on an ads pre-pay: immediately stop serving and reverse the
        // recognized revenue. Idempotent across dispute.create/remind/resolve.
        if (disputeRef) {
          try {
            const { data: disputedTxn } = await (supabase.from("payment_transactions") as any)
              .select("amount, metadata")
              .eq("reference", String(disputeRef))
              .eq("status", "success")
              .maybeSingle();
            const disputedMeta = (disputedTxn?.metadata ?? {}) as Record<string, unknown>;
            if (disputedMeta?.kind === "marketing_credit_topup") {
              // Chargeback on a marketing credit top-up: claw back unspent
              // credits and reverse the recognized revenue.
              const { reverseMarketingCreditTopupPayment } = await import(
                "@/lib/marketing/marketing-credit-topup-payment"
              );
              await reverseMarketingCreditTopupPayment({
                supabase: supabase as never,
                providerId: String(disputedMeta.provider_id ?? ""),
                reference: String(disputeRef),
                amountMajor: Number((disputedTxn as { amount?: number } | null)?.amount ?? 0),
                reason: `chargeback:${eventType}`,
              });
            } else if (disputedMeta?.kind === "ads_budget_order" && disputedMeta?.ads_budget_order_id) {
              const { reverseAdsBudgetOrderPayment } = await import(
                "@/lib/ads/ads-budget-order-payment"
              );
              await reverseAdsBudgetOrderPayment({
                supabase: supabase as never,
                orderId: String(disputedMeta.ads_budget_order_id),
                finalOrderStatus: "refunded",
                reason: `chargeback:${eventType}`,
                reference: String(disputeRef),
              });
            } else if (
              disputedMeta?.kind === "provider_subscription_order" ||
              disputedMeta?.kind === "subscription_authorization" ||
              disputedMeta?.kind === "subscription_renewal"
            ) {
              // Chargeback on a subscription charge: reverse the recognized
              // revenue, disable Paystack billing, and fall the provider to free.
              const { reverseProviderSubscriptionPayment } = await import(
                "@/lib/subscriptions/provider-subscription-payment"
              );
              await reverseProviderSubscriptionPayment({
                supabase: supabase as never,
                reason: `chargeback:${eventType}`,
                reference: String(disputeRef),
                orderId: (disputedMeta.provider_subscription_order_id as string) ?? null,
                subscriptionCode: (disputedMeta.subscription_code as string) ?? null,
                providerIdHint: (disputedMeta.provider_id as string) ?? null,
              });
            }
          } catch (disputeReversalError) {
            console.error("[webhook] dispute reversal failed:", disputeReversalError);
          }
          try {
            const { openFraudCaseFromPaystackDispute } = await import(
              "@/lib/fraud/open-fraud-from-paystack-dispute"
            );
            await openFraudCaseFromPaystackDispute({
              eventType,
              eventId: eventId != null ? String(eventId) : undefined,
              reference: String(disputeRef),
              disputeData: disputeData as Record<string, unknown> | null,
              supabase: supabase as never,
            });
          } catch (fraudCaseErr) {
            console.error("[webhook] fraud case open failed:", fraudCaseErr);
          }
        }
        response = NextResponse.json({ received: true });
      } else {
        console.log(`[webhook] unhandled event type: ${eventType}`, { eventId });
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
