/**
 * POST /api/webhooks/didit
 *
 * Handles Didit identity-verification webhook events.
 *
 * Security:
 * - 3-variant HMAC-SHA256 verification (V2 canonical > raw body > simple)
 * - 300-second replay window (|now - X-Timestamp| > 300 rejects)
 * - Constant-time signature compare
 * - Idempotency on Didit event_id (duplicate deliveries are no-ops)
 * - Monotonic status application (stale events never downgrade approved)
 *
 * This route is CSRF-exempt (no session cookie needed; the webhook is
 * authenticated via HMAC signature).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyDiditWebhookSignature } from "@/lib/identity-verification/provider/didit-provider";
import { handleVerificationWebhook } from "@/lib/identity-verification/identity-verification-service";
import type { DiditWebhookPayload } from "@/lib/identity-verification/types";

export const dynamic = "force-dynamic";

/** Session-level webhook events we act on. Others are acknowledged and ignored. */
const SESSION_EVENT_TYPES = new Set(["status.updated", "data.updated"]);

export async function POST(request: NextRequest) {
  // Read raw body for HMAC verification (must happen before any parsing)
  const rawBodyBuffer = Buffer.from(await request.arrayBuffer());

  // Didit sends all three signature headers; each has its own algorithm.
  const signatureV2     = request.headers.get("x-signature-v2");
  const signatureRaw    = request.headers.get("x-signature");
  const signatureSimple = request.headers.get("x-signature-simple");
  const timestamp       = request.headers.get("x-timestamp") ?? null;

  const sigResult = verifyDiditWebhookSignature({
    rawBody: rawBodyBuffer,
    signatureV2,
    signatureRaw,
    signatureSimple,
    timestamp,
  });

  if (!sigResult.ok) {
    console.warn("[webhook/didit] invalid signature");
    return NextResponse.json(
      { error: "DIDIT_WEBHOOK_SIGNATURE_INVALID" },
      { status: 401 },
    );
  }

  // Parse payload
  let payload: DiditWebhookPayload;
  try {
    payload = JSON.parse(rawBodyBuffer.toString("utf8")) as DiditWebhookPayload;
  } catch {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const eventId = payload.event_id;
  if (!eventId) {
    return NextResponse.json({ error: "MISSING_EVENT_ID" }, { status: 400 });
  }

  // Gracefully acknowledge (200) events we don't handle — entity/transaction
  // events, or session events without a session_id — so Didit does not retry
  // and eventually drop them.
  if (!SESSION_EVENT_TYPES.has(payload.webhook_type) || !payload.session_id) {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  // Return 2xx immediately — heavy processing runs after the response is queued.
  // Didit times out the delivery after 5 seconds and expects a fast 2xx.
  const responsePromise = NextResponse.json({ received: true }, { status: 200 });

  handleVerificationWebhook(
    payload,
    rawBodyBuffer,
    eventId,
    sigResult.variant,
  ).catch((err) => {
    console.error("[webhook/didit] processing error:", err);
  });

  return responsePromise;
}
