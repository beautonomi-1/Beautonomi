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
 *
 * Didit Business Console "Test Webhook" payloads often omit `event_id` and set
 * `X-Didit-Test-Webhook: true`. Those are acknowledged with 200 so the console
 * shows success; live deliveries always include `event_id`.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyDiditWebhookSignature } from "@/lib/identity-verification/provider/didit-provider";
import { handleVerificationWebhook } from "@/lib/identity-verification/identity-verification-service";
import type { DiditWebhookPayload } from "@/lib/identity-verification/types";

export const dynamic = "force-dynamic";

/** Session-level webhook events we act on. Others are acknowledged and ignored. */
const SESSION_EVENT_TYPES = new Set(["status.updated", "data.updated"]);

function isDiditConsoleTestWebhook(
  request: NextRequest,
  payload: DiditWebhookPayload,
): boolean {
  const header = request.headers.get("x-didit-test-webhook");
  if (header === "true" || header === "1") return true;
  const meta = payload.metadata as Record<string, unknown> | undefined;
  if (meta?.test_webhook === true) return true;
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes("(Test)")) return true;
  return false;
}

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
    userAgent: request.headers.get("user-agent"),
  });

  if (sigResult.ok === false) {
    console.warn("[webhook/didit] invalid signature", sigResult.diagnostics);
    return NextResponse.json(
      { error: "DIDIT_WEBHOOK_SIGNATURE_INVALID", reason: sigResult.diagnostics.reason },
      { status: 401 },
    );
  }

  // Parse payload
  let payload: DiditWebhookPayload;
  try {
    payload = JSON.parse(rawBodyBuffer.toString("utf8")) as DiditWebhookPayload;
  } catch {
    console.warn("[webhook/didit] invalid payload JSON");
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const eventId = payload.event_id;
  if (!eventId) {
    // Console "Test Webhook" often omits event_id; acknowledge so Didit shows success.
    // Do not apply state — synthetic session_ids are not in our DB.
    if (isDiditConsoleTestWebhook(request, payload)) {
      console.info("[webhook/didit] console test webhook acknowledged (no event_id)", {
        webhook_type: payload.webhook_type,
        session_id: payload.session_id ?? null,
        status: payload.status ?? null,
      });
      return NextResponse.json(
        { received: true, ignored: true, reason: "didit_console_test_missing_event_id" },
        { status: 200 },
      );
    }
    console.warn("[webhook/didit] missing event_id", {
      webhook_type: payload.webhook_type,
      session_id: payload.session_id ?? null,
    });
    return NextResponse.json({ error: "MISSING_EVENT_ID" }, { status: 400 });
  }

  // Gracefully acknowledge (200) events we don't handle — entity/transaction
  // events, or session events without a session_id — so Didit does not retry
  // and eventually drop them.
  if (
    !SESSION_EVENT_TYPES.has(payload.webhook_type) ||
    (!payload.session_id && !payload.business_session_id)
  ) {
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
