/**
 * Admin replay of a stored inbound PSP webhook (`webhook_events`) through the
 * same handler entry points the live webhook routes use.
 *
 * Idempotency:
 *  - rows already `processed` short-circuit unless `force` is set;
 *  - `signature_rejected` rows are never replayable (payload was never authenticated);
 *  - the handlers themselves dedupe on payment_transactions / booking_payments.
 *
 * Note: stored payloads pass through `sanitizeWebhookPayload`, so fields the
 * sanitizer strips (e.g. raw card authorization blobs) are absent on replay.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaystackEvent } from "@/app/api/payments/webhook/_handlers/shared";

export type ReplayableSource = "paystack" | "stripe" | "flutterwave";
export const REPLAYABLE_SOURCES: ReplayableSource[] = ["paystack", "stripe", "flutterwave"];

export type WebhookEventRow = {
  id: string;
  event_id: string;
  source: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  error_message: string | null;
  attempt_count?: number | null;
  processed_at: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type ReplayResult =
  | { ok: true; replayed: true; handler: string }
  | { ok: true; replayed: false; reason: "already_processed" | "unhandled_event_type"; handler?: string }
  | { ok: false; reason: string; code: "NOT_REPLAYABLE" | "HANDLER_FAILED" | "INVALID_PAYLOAD" };

type PaystackHandlers = {
  handleChargeSuccess: (event: PaystackEvent, supabase: SupabaseClient) => Promise<unknown>;
  handleChargeFailed: (event: PaystackEvent, supabase: SupabaseClient) => Promise<unknown>;
  handleTransferEvent: (event: PaystackEvent, supabase: SupabaseClient) => Promise<unknown>;
  handleSubscriptionEvent: (event: PaystackEvent, supabase: SupabaseClient) => Promise<unknown>;
  handleRefundEvent: (event: PaystackEvent, supabase: SupabaseClient) => Promise<unknown>;
};

type StripeHandlers = {
  handleStripePaymentIntentSucceeded: (intent: Record<string, unknown>) => Promise<void>;
  handleStripeChargeRefunded: (charge: Record<string, unknown>) => Promise<void>;
  handleStripeChargeDisputeCreated: (dispute: Record<string, unknown>, eventId?: string) => Promise<void>;
};

type FlutterwaveHandlers = {
  handleFlutterwaveChargeCompleted: (data: Record<string, unknown>) => Promise<void>;
};

export type ReplayHandlerLoaders = {
  paystack: () => Promise<PaystackHandlers>;
  stripe: () => Promise<StripeHandlers>;
  flutterwave: () => Promise<FlutterwaveHandlers>;
};

/** Lazy imports keep the admin route bundle small and make handlers mockable in tests. */
export const defaultReplayHandlerLoaders: ReplayHandlerLoaders = {
  paystack: async () => {
    const [charge, subs, transfers, refunds] = await Promise.all([
      import("@/app/api/payments/webhook/_handlers/charge-success"),
      import("@/app/api/payments/webhook/_handlers/subscription-events"),
      import("@/app/api/payments/webhook/_handlers/transfer-events"),
      import("@/app/api/payments/webhook/_handlers/refund-events"),
    ]);
    return {
      handleChargeSuccess: charge.handleChargeSuccess,
      handleChargeFailed: charge.handleChargeFailed,
      handleSubscriptionEvent: subs.handleSubscriptionEvent,
      handleTransferEvent: transfers.handleTransferEvent,
      handleRefundEvent: refunds.handleRefundEvent,
    };
  },
  stripe: async () => {
    const [charge, dispute] = await Promise.all([
      import("@/app/api/payments/stripe/webhook/_handlers/stripe-charge"),
      import("@/app/api/payments/stripe/webhook/_handlers/stripe-dispute"),
    ]);
    return {
      handleStripePaymentIntentSucceeded: charge.handleStripePaymentIntentSucceeded as StripeHandlers["handleStripePaymentIntentSucceeded"],
      handleStripeChargeRefunded: charge.handleStripeChargeRefunded as StripeHandlers["handleStripeChargeRefunded"],
      handleStripeChargeDisputeCreated: dispute.handleStripeChargeDisputeCreated as StripeHandlers["handleStripeChargeDisputeCreated"],
    };
  },
  flutterwave: async () => {
    const mod = await import("@/app/api/payments/flutterwave/webhook/_handlers/flutterwave-charge");
    return {
      handleFlutterwaveChargeCompleted:
        mod.handleFlutterwaveChargeCompleted as FlutterwaveHandlers["handleFlutterwaveChargeCompleted"],
    };
  },
};

const PAYSTACK_SUBSCRIPTION_EVENTS = new Set([
  "subscription.create",
  "subscription.disable",
  "subscription.enable",
  "subscription.not_renew",
  "subscription.expiring_cards",
  "invoice.create",
  "invoice.update",
  "invoice.payment_failed",
]);

export function isReplayableSource(source: string): source is ReplayableSource {
  return (REPLAYABLE_SOURCES as string[]).includes(source);
}

export async function replayInboundWebhookEvent(
  supabase: SupabaseClient,
  row: WebhookEventRow,
  options: { force?: boolean; loaders?: ReplayHandlerLoaders } = {},
): Promise<ReplayResult> {
  const loaders = options.loaders ?? defaultReplayHandlerLoaders;

  if (!isReplayableSource(row.source)) {
    return { ok: false, code: "NOT_REPLAYABLE", reason: `source '${row.source}' is not replayable` };
  }
  if (row.event_type === "signature_rejected" || row.event_id.startsWith("sigfail:")) {
    return {
      ok: false,
      code: "NOT_REPLAYABLE",
      reason: "signature-rejected events were never authenticated and cannot be replayed",
    };
  }
  if (row.status === "processed" && !options.force) {
    return { ok: true, replayed: false, reason: "already_processed" };
  }
  const payload = row.payload;
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "INVALID_PAYLOAD", reason: "stored payload is empty" };
  }

  const markProcessing = async () => {
    await supabase
      .from("webhook_events")
      .update({ status: "processing", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  };
  const markProcessed = async () => {
    await supabase
      .from("webhook_events")
      .update({ status: "processed", error_message: null, processed_at: new Date().toISOString() })
      .eq("id", row.id);
  };
  const markFailed = async (message: string) => {
    await supabase
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: `replay: ${message}`.slice(0, 2000),
        processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  };

  let handlerName: string | null = null;
  try {
    if (row.source === "paystack") {
      const event = payload as unknown as PaystackEvent;
      const eventType = String(event.event ?? row.event_type ?? "");
      if (!eventType || !event.data) {
        return { ok: false, code: "INVALID_PAYLOAD", reason: "paystack payload missing event/data" };
      }
      const h = await loaders.paystack();
      let fn: ((e: PaystackEvent, s: SupabaseClient) => Promise<unknown>) | null = null;
      if (eventType === "charge.success") {
        fn = h.handleChargeSuccess;
        handlerName = "handleChargeSuccess";
      } else if (eventType === "charge.failed") {
        fn = h.handleChargeFailed;
        handlerName = "handleChargeFailed";
      } else if (eventType.startsWith("transfer.")) {
        fn = h.handleTransferEvent;
        handlerName = "handleTransferEvent";
      } else if (PAYSTACK_SUBSCRIPTION_EVENTS.has(eventType)) {
        fn = h.handleSubscriptionEvent;
        handlerName = "handleSubscriptionEvent";
      } else if (eventType.startsWith("refund.")) {
        fn = h.handleRefundEvent;
        handlerName = "handleRefundEvent";
      }
      if (!fn) return { ok: true, replayed: false, reason: "unhandled_event_type" };
      await markProcessing();
      await fn(event, supabase);
    } else if (row.source === "stripe") {
      const eventType = String((payload as { type?: string }).type ?? row.event_type ?? "");
      const object =
        ((payload as { data?: { object?: Record<string, unknown> } }).data?.object ?? null) as Record<string, unknown> | null;
      if (!object) return { ok: false, code: "INVALID_PAYLOAD", reason: "stripe payload missing data.object" };
      const h = await loaders.stripe();
      let run: (() => Promise<void>) | null = null;
      if (eventType === "payment_intent.succeeded") {
        run = () => h.handleStripePaymentIntentSucceeded(object);
        handlerName = "handleStripePaymentIntentSucceeded";
      } else if (eventType === "charge.refunded") {
        run = () => h.handleStripeChargeRefunded(object);
        handlerName = "handleStripeChargeRefunded";
      } else if (eventType === "charge.dispute.created") {
        run = () => h.handleStripeChargeDisputeCreated(object, row.event_id);
        handlerName = "handleStripeChargeDisputeCreated";
      }
      if (!run) return { ok: true, replayed: false, reason: "unhandled_event_type" };
      await markProcessing();
      await run();
    } else {
      const eventType = String(
        (payload as { event?: string })["event"] ?? (payload as Record<string, unknown>)["event.type"] ?? row.event_type ?? "",
      );
      const data =
        (payload as { data?: Record<string, unknown> }).data && typeof (payload as { data?: unknown }).data === "object"
          ? ((payload as { data: Record<string, unknown> }).data)
          : (payload as Record<string, unknown>);
      const isCharge =
        eventType === "charge.completed" || String(data.status ?? "").toLowerCase() === "successful";
      if (!isCharge) return { ok: true, replayed: false, reason: "unhandled_event_type" };
      const h = await loaders.flutterwave();
      handlerName = "handleFlutterwaveChargeCompleted";
      await markProcessing();
      await h.handleFlutterwaveChargeCompleted(data);
    }

    await markProcessed();
    return { ok: true, replayed: true, handler: handlerName ?? "unknown" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(message);
    return { ok: false, code: "HANDLER_FAILED", reason: message };
  }
}
