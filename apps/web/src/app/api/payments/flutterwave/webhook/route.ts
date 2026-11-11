import { NextResponse } from "next/server";

export const maxDuration = 60;
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeWebhookPayload } from "@/lib/payment/webhook-payload-sanitizer";
import { persistFailedWebhookSignature } from "@/lib/payment/persist-failed-webhook-signature";
import {
  acquireWebhookEventLease,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from "@/lib/payment/webhook-event-lease";
import { settleFlutterwaveChargeWebhookData } from "@/lib/payments/settle-flutterwave-online-payment";
import { verifyFlutterwaveWebhookSignature } from "@/lib/payments/flutterwave-webhook-verify";
import { handleFlutterwaveTransferWebhook } from "@/lib/payments/flutterwave-transfer-webhook";
import { handleFlutterwaveDisputeWebhook } from "@/lib/payments/flutterwave-dispute-handler";
import { handleFlutterwaveRefundWebhook } from "@/lib/payments/flutterwave-refund-webhook";

/**
 * POST /api/payments/flutterwave/webhook
 * Flutterwave webhook for booking charge.completed events.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("verif-hash");

  if (!(await verifyFlutterwaveWebhookSignature(body, signature))) {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      parsed = undefined;
    }
    await persistFailedWebhookSignature(getSupabaseAdmin(), {
      source: "flutterwave",
      body,
      errorMessage: signature ? "verif-hash mismatch" : "missing verif-hash header",
      parsedPayload: parsed,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(payload.event ?? payload["event.type"] ?? "");
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;

  const supabase = getSupabaseAdmin();
  const normalizedEventType = (eventType || "charge.completed").toLowerCase();

  // F2-30: the event id must be deterministic so replays dedupe. Flutterwave
  // has no top-level event id, so key on event type + data.id (transaction /
  // transfer / refund id); fall back to tx_ref + status. Never random — and an
  // event we cannot key is rejected rather than processed unguarded.
  const eventId = deriveFlutterwaveEventId(normalizedEventType, data, payload);
  if (!eventId) {
    return NextResponse.json({ error: "Event has no id or tx_ref" }, { status: 400 });
  }
  const sanitizedPayload = sanitizeWebhookPayload(payload);

  // F-06: shared lease RPC (same as Paystack / Stripe / Apple) replaces the
  // racy select-then-insert.
  const lease = await acquireWebhookEventLease(supabase, {
    eventId,
    source: WEBHOOK_SOURCE,
    eventType: normalizedEventType,
    payload: sanitizedPayload,
  });
  if (lease.outcome === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (lease.outcome === "in_flight") {
    return NextResponse.json({ received: true, processing: true }, { status: 503 });
  }

  try {
    if (normalizedEventType.includes("transfer.")) {
      await handleFlutterwaveTransferWebhook(data, supabase);
    } else if (normalizedEventType.includes("chargeback") || normalizedEventType.includes("dispute")) {
      await handleFlutterwaveDisputeWebhook(eventType, data, supabase);
    } else if (normalizedEventType.includes("refund")) {
      await handleFlutterwaveRefundWebhook(data, supabase);
    } else if (normalizedEventType.includes("charge")) {
      await settleFlutterwaveChargeWebhookData(data, supabase);
    }

    await markWebhookEventProcessed(supabase, { eventId, source: WEBHOOK_SOURCE });
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[flutterwave/webhook] handler error:", err);
    await markWebhookEventFailed(supabase, { eventId, source: WEBHOOK_SOURCE, errorMessage: message });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

const WEBHOOK_SOURCE = "flutterwave";

function scalarToString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Deterministic dedupe key for a Flutterwave webhook; null when none can be built. */
function deriveFlutterwaveEventId(
  eventType: string,
  data: Record<string, unknown>,
  payload: Record<string, unknown>,
): string | null {
  const dataId = scalarToString(data.id) ?? scalarToString(payload.id);
  if (dataId) return `${eventType}:${dataId}`;
  const txRef =
    scalarToString(data.tx_ref) ?? scalarToString(data.reference) ?? scalarToString(data.flw_ref);
  if (!txRef) return null;
  const status = scalarToString(data.status) ?? "";
  return `${eventType}:${txRef}:${status.toLowerCase()}`;
}
