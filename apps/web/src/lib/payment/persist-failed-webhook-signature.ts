import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slackNotifyWebhookSignatureRejected } from "@/lib/integrations/slack/ops-triggers";

const MAX_PAYLOAD_BYTES = 64 * 1024;

function truncatePayload(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  const raw = JSON.stringify(payload);
  if (raw.length <= MAX_PAYLOAD_BYTES) return payload;
  return {
    _truncated: true,
    _original_bytes: raw.length,
    preview: raw.slice(0, MAX_PAYLOAD_BYTES),
  };
}

/**
 * Upsert a failed-signature row into webhook_events for ops forensics.
 * Uses event_id = sigfail:<sha256(body)> with attempt_count increment on conflict.
 */
export async function persistFailedWebhookSignature(
  supabase: SupabaseClient,
  params: {
    source: "paystack" | "stripe" | "flutterwave";
    body: string;
    errorMessage: string;
    parsedPayload?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    const eventId = `sigfail:${crypto.createHash("sha256").update(params.body).digest("hex")}`;
    const payload = truncatePayload(params.parsedPayload ?? null);

    const { data: existing } = await supabase
      .from("webhook_events")
      .select("attempt_count")
      .eq("event_id", eventId)
      .eq("source", params.source)
      .maybeSingle();

    const attemptCount = Number((existing as { attempt_count?: number } | null)?.attempt_count ?? 0) + 1;
    const now = new Date().toISOString();

    const { error } = await supabase.from("webhook_events").upsert(
      {
        event_id: eventId,
        source: params.source,
        event_type: "signature_rejected",
        payload,
        status: "failed",
        error_message: params.errorMessage.slice(0, 2000),
        attempt_count: attemptCount,
        processed_at: now,
        updated_at: now,
      },
      { onConflict: "event_id,source" },
    );

    if (error) {
      console.error("[persistFailedWebhookSignature] upsert failed:", error.message);
      return;
    }

    if (attemptCount === 1) {
      slackNotifyWebhookSignatureRejected({
        source: params.source,
        eventId,
        errorMessage: params.errorMessage,
        attemptCount,
      });
    }
  } catch (err) {
    console.error("[persistFailedWebhookSignature] unexpected error:", err);
  }
}
