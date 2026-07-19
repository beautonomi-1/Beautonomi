import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { sanitizeWebhookPayload } from "@/lib/payment/webhook-payload-sanitizer";
import type { VerifiedWebhookEvent } from "@/lib/payments/provider/types";
import {
  handleStripeChargeRefunded,
  handleStripePaymentIntentSucceeded,
} from "./_handlers/stripe-charge";
import { handleStripeChargeDisputeCreated } from "./_handlers/stripe-dispute";

type LeaseRow = {
  acquired: boolean;
  already_processed: boolean;
  stale_lease_reclaimed: boolean;
  status: string;
};

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Build candidate tenant ids whose Stripe webhook secret could have signed this event.
 * Payload hints are untrusted; constructEvent must still match.
 */
async function resolveStripeWebhookCandidateTenantIds(params: {
  body: string;
  hostTenantId: string | null;
}): Promise<Array<string | null>> {
  const candidates: Array<string | null> = [];
  const push = (value: string | null | undefined) => {
    const normalized =
      typeof value === "string" && value.trim()
        ? value.trim()
        : value === null
          ? null
          : undefined;
    if (normalized === undefined) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  push(params.hostTenantId);

  try {
    const parsed = safeParseJson(params.body);
    const data =
      parsed?.data && typeof parsed.data === "object"
        ? (parsed.data as Record<string, unknown>)
        : null;
    const object =
      data?.object && typeof data.object === "object"
        ? (data.object as Record<string, unknown>)
        : null;
    const metadata =
      object?.metadata && typeof object.metadata === "object" && !Array.isArray(object.metadata)
        ? (object.metadata as Record<string, unknown>)
        : {};

    push(typeof metadata.tenant_id === "string" ? metadata.tenant_id : null);

    const supabase = getSupabaseAdmin();
    const bookingId = typeof metadata.booking_id === "string" ? metadata.booking_id.trim() : "";
    if (bookingId) {
      const { data: bookingRow } = await supabase
        .from("bookings")
        .select("tenant_id")
        .eq("id", bookingId)
        .maybeSingle();
      push((bookingRow as { tenant_id?: string | null } | null)?.tenant_id ?? undefined);
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
    console.error("[stripe/webhook] candidate tenant resolution failed:", err);
  }

  push(null);
  return candidates;
}

async function verifyStripeWebhookAcrossTenants(
  body: string,
  signature: string,
  candidateTenantIds: Array<string | null>,
): Promise<VerifiedWebhookEvent> {
  const Stripe = (await import("stripe")).default;
  const { getStripeWebhookSecret } = await import("@/lib/payments/stripe-server");
  const seenSecrets = new Set<string>();

  for (const tenantId of candidateTenantIds) {
    let secret: string;
    try {
      secret = await getStripeWebhookSecret({ tenantId });
    } catch {
      continue;
    }
    if (!secret || seenSecrets.has(secret)) continue;
    seenSecrets.add(secret);
    try {
      const event = Stripe.webhooks.constructEvent(body, signature, secret);
      return {
        provider: "stripe",
        id: event.id,
        type: event.type,
        raw: event,
      };
    } catch {
      continue;
    }
  }

  throw new Error("Invalid Stripe webhook signature");
}

/**
 * POST /api/payments/stripe/webhook
 * Stripe webhook with lease-based idempotency (matches Paystack webhook pattern).
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let hostTenantId: string | null = null;
  try {
    const tenant = await resolveTenantFromRequest(request);
    hostTenantId = tenant?.id ?? null;
  } catch {
    hostTenantId = null;
  }

  let verified: VerifiedWebhookEvent;
  try {
    const candidateTenantIds = await resolveStripeWebhookCandidateTenantIds({
      body,
      hostTenantId,
    });
    verified = await verifyStripeWebhookAcrossTenants(body, signature, candidateTenantIds);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventId = verified.id;
  const eventType = verified.type;
  const supabase = getSupabaseAdmin();
  const sanitizedPayload = sanitizeWebhookPayload(verified.raw as Record<string, unknown>);

  const { data: leaseRow, error: leaseError } = await (supabase.rpc as any)(
    "try_acquire_webhook_event_lease",
    {
      p_event_id: eventId,
      p_source: "stripe",
      p_event_type: eventType,
      p_payload: sanitizedPayload,
      p_lease_seconds: 300,
    },
  );

  const lease: LeaseRow | null = Array.isArray(leaseRow)
    ? ((leaseRow[0] ?? null) as LeaseRow | null)
    : ((leaseRow as LeaseRow | null) ?? null);

  if (leaseError) {
    console.error("[stripe/webhook] try_acquire_webhook_event_lease failed:", leaseError);
  }

  if (lease) {
    if (lease.already_processed) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (!lease.acquired) {
      return NextResponse.json({ received: true, processing: true });
    }
    if (lease.stale_lease_reclaimed) {
      console.warn(`[stripe/webhook] event ${eventId} stale lease reclaimed`);
    }
  } else if (leaseError) {
    const { error: insertError } = await supabase.from("webhook_events").insert({
      event_id: eventId,
      source: "stripe",
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
          .eq("source", "stripe")
          .single();
        if (existingEvent) {
          if ((existingEvent as { status?: string }).status === "processed") {
            return NextResponse.json({ received: true, duplicate: true });
          }
          return NextResponse.json({ received: true, processing: true });
        }
      }
      throw insertError;
    }
  }

  const eventObject =
    ((verified.raw as { data?: { object?: Record<string, unknown> } })?.data?.object ?? {}) as Record<
      string,
      unknown
    >;

  try {
    switch (eventType) {
      case "payment_intent.succeeded":
        await handleStripePaymentIntentSucceeded(eventObject);
        break;
      case "charge.refunded":
        await handleStripeChargeRefunded(eventObject);
        break;
      case "payment_intent.payment_failed":
        console.info("[stripe/webhook] received", eventType, eventId);
        break;
      case "charge.dispute.created":
        await handleStripeChargeDisputeCreated(eventObject, eventId);
        break;
      case "charge.dispute.closed":
        console.info("[stripe/webhook] received", eventType, eventId);
        break;
      default:
        break;
    }

    await (supabase.from("webhook_events") as any)
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("source", "stripe");

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe/webhook] handler error:", err);
    await (supabase.from("webhook_events") as any)
      .update({
        status: "failed",
        error_message: message,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId)
      .eq("source", "stripe");
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
