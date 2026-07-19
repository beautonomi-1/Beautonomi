/**
 * F7: Scrubber for webhook_events.payload.
 *
 * Webhook payloads from Paystack/Yoco include customer emails and free-text metadata
 * that we must not retain indefinitely. We keep only the structural fields necessary
 * for reconciliation and idempotency. The scrubbed payload is safe for long-term
 * storage; the original encrypted payload can optionally be persisted in
 * webhook_events.payload_encrypted if pgsodium is configured.
 */

const KEEP_TOP_LEVEL = new Set([
  "event",
  "type",
  "id",
  "domain",
  "created_at",
  "sent_at",
  "status",
  "channel",
  "livemode",
  "api_version",
]);

const KEEP_DATA_FIELDS = new Set([
  "id",
  "domain",
  "status",
  "reference",
  "amount",
  "currency",
  "channel",
  "gateway_response",
  "paid_at",
  "created_at",
  "transaction_date",
  "fees",
  "fees_split",
  "fees_breakdown",
  "plan",
  "split",
  "transaction_reference",
  "refund_reference",
  "event",
  "payment_method",
  "object",
  "payment_intent",
  "amount_received",
  "amount_refunded",
  "balance_transaction",
  "customer",
  "dispute",
]);

const KEEP_METADATA_FIELDS = new Set([
  "booking_id",
  "booking_number",
  "order_id",
  "product_order_id",
  "customer_id",
  "provider_id",
  "tenant_id",
  "payment_option",
  "amount_to_collect",
  "booking_total_amount",
  "requires_deposit",
  "gift_card_amount_applied",
  "wallet_amount_applied",
  "currency",
  "tip_amount",
  "tax_amount",
  "travel_fee",
  "service_fee_amount",
  "service_fee_percentage",
  "commission_base",
  "save_card",
  "set_as_default",
  "hold_id",
  "payment_method_id",
  "loyalty_points_used",
  "loyalty_discount_amount",
  "subscribe_recurring_frequency",
]);

function pick<T extends Record<string, unknown>>(obj: T, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) out[key] = obj[key];
  }
  return out;
}

/** Sanitize a Paystack/Yoco/Stripe webhook event body for long-term retention. */
export function sanitizeWebhookPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const event = raw as Record<string, unknown>;
  const top = pick(event, KEEP_TOP_LEVEL);

  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : undefined;
  if (data) {
    // Stripe: { data: { object: { ... } } }
    const stripeObject =
      data.object && typeof data.object === "object"
        ? (data.object as Record<string, unknown>)
        : undefined;
    if (stripeObject) {
      const cleanObject = pick(stripeObject, KEEP_DATA_FIELDS);
      const metadata =
        stripeObject.metadata && typeof stripeObject.metadata === "object"
          ? (stripeObject.metadata as Record<string, unknown>)
          : undefined;
      if (metadata) {
        cleanObject.metadata = pick(metadata, KEEP_METADATA_FIELDS);
      }
      top.data = { object: cleanObject };
    } else {
      const cleanData = pick(data, KEEP_DATA_FIELDS);
      const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : undefined;
      if (metadata) {
        cleanData.metadata = pick(metadata, KEEP_METADATA_FIELDS);
      }
      top.data = cleanData;
    }
  }

  return top;
}

/** Stable hash over the sanitised payload, used as an idempotency key. */
export async function sanitizedPayloadHash(payload: Record<string, unknown>): Promise<string> {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(normalized));
  return Buffer.from(digest).toString("hex");
}
