/**
 * Shared webhook idempotency lease.
 *
 * Wraps the `try_acquire_webhook_event_lease` RPC already used by the
 * Paystack / Stripe / Apple webhook routes so other gateways (Flutterwave,
 * PayCloud, …) get identical semantics:
 *   - inserts the `webhook_events` row when new,
 *   - reclaims a stale "processing" lease left by a dead worker,
 *   - refuses while another live worker holds the lease,
 *   - reports "already processed" for replays.
 *
 * When the RPC itself errors (missing function, outage) we fall back to a
 * best-effort unique insert so processing still runs exactly once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookLeaseOutcome =
  | { outcome: "acquired"; staleReclaimed: boolean }
  | { outcome: "duplicate" }
  | { outcome: "in_flight" };

type LeaseRow = {
  acquired: boolean;
  already_processed: boolean;
  stale_lease_reclaimed: boolean;
  status: string;
};

export async function acquireWebhookEventLease(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    source: string;
    eventType: string;
    payload: unknown;
    leaseSeconds?: number;
  },
): Promise<WebhookLeaseOutcome> {
  const { data: leaseRow, error: leaseError } = await (supabase.rpc as any)(
    "try_acquire_webhook_event_lease",
    {
      p_event_id: params.eventId,
      p_source: params.source,
      p_event_type: params.eventType,
      p_payload: params.payload,
      p_lease_seconds: params.leaseSeconds ?? 300,
    },
  );

  const lease: LeaseRow | null = Array.isArray(leaseRow)
    ? ((leaseRow[0] ?? null) as LeaseRow | null)
    : ((leaseRow as LeaseRow | null) ?? null);

  if (lease) {
    if (lease.already_processed) return { outcome: "duplicate" };
    if (!lease.acquired) return { outcome: "in_flight" };
    if (lease.stale_lease_reclaimed) {
      console.warn(`[webhook-lease] ${params.source} event ${params.eventId} stale lease reclaimed`);
    }
    return { outcome: "acquired", staleReclaimed: Boolean(lease.stale_lease_reclaimed) };
  }

  if (leaseError) {
    console.error(`[webhook-lease] try_acquire_webhook_event_lease failed (${params.source}):`, leaseError);
  }

  // Legacy fallback: rely on the UNIQUE(event_id, source) constraint.
  const { error: insertError } = await supabase.from("webhook_events").insert({
    event_id: params.eventId,
    source: params.source,
    event_type: params.eventType,
    payload: params.payload,
    status: "processing",
    processed_at: null,
  });
  if (!insertError) return { outcome: "acquired", staleReclaimed: false };

  const isUnique =
    insertError.code === "23505" ||
    insertError.message?.includes("unique") ||
    insertError.message?.includes("duplicate");
  if (!isUnique) throw insertError;

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id, status")
    .eq("event_id", params.eventId)
    .eq("source", params.source)
    .maybeSingle();
  if ((existing as { status?: string } | null)?.status === "processed") {
    return { outcome: "duplicate" };
  }
  return { outcome: "in_flight" };
}

export async function markWebhookEventProcessed(
  supabase: SupabaseClient,
  params: { eventId: string; source: string },
): Promise<void> {
  await supabase
    .from("webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .eq("event_id", params.eventId)
    .eq("source", params.source);
}

export async function markWebhookEventFailed(
  supabase: SupabaseClient,
  params: { eventId: string; source: string; errorMessage: string },
): Promise<void> {
  await supabase
    .from("webhook_events")
    .update({
      status: "failed",
      error_message: params.errorMessage.slice(0, 2000),
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", params.eventId)
    .eq("source", params.source);
}
