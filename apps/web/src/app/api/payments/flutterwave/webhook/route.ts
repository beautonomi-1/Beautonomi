import { NextResponse } from "next/server";

export const maxDuration = 60;
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sanitizeWebhookPayload } from "@/lib/payment/webhook-payload-sanitizer";
import { persistFailedWebhookSignature } from "@/lib/payment/persist-failed-webhook-signature";
import { handleFlutterwaveChargeCompleted } from "./_handlers/flutterwave-charge";

function verifyFlutterwaveSignature(body: string, signature: string | null): boolean {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signature) {
    return false;
  }
  const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (hash.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

/**
 * POST /api/payments/flutterwave/webhook
 * Flutterwave webhook for booking charge.completed events.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("verif-hash");

  if (!verifyFlutterwaveSignature(body, signature)) {
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
  const eventId = String(data.id ?? data.tx_ref ?? payload.id ?? crypto.randomUUID());
  const sanitizedPayload = sanitizeWebhookPayload(payload);

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("source", "flutterwave")
    .maybeSingle();

  if (existing && (existing as { status?: string }).status === "processed") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!existing) {
    await supabase.from("webhook_events").insert({
      event_id: eventId,
      source: "flutterwave",
      event_type: eventType || "charge.completed",
      payload: sanitizedPayload,
      status: "processing",
      processed_at: null,
    });
  }

  try {
    if (
      eventType === "charge.completed" ||
      String(data.status ?? "").toLowerCase() === "successful"
    ) {
      await handleFlutterwaveChargeCompleted(data as Parameters<typeof handleFlutterwaveChargeCompleted>[0]);
    }

    await supabase
      .from("webhook_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("source", "flutterwave");

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[flutterwave/webhook] handler error:", err);
    await supabase
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: message,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("source", "flutterwave");
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
