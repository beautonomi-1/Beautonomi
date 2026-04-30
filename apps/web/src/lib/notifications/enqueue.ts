/**
 * Wave 3.1 (audit 2026-04 final 100/100) — unified notification producer.
 *
 * Problem we are solving
 * ----------------------
 * Today each caller (booking confirmed, reschedule, cancel, refund,
 * payout, reminders, abandoned booking, provider-new-booking) hand-rolls
 * its own mix of:
 *   • directly writing into `notifications` for in-app rows
 *   • directly firing OneSignal
 *   • directly calling Resend
 *   • *sometimes* inserting into `notification_delivery_queue`
 *
 * That means a transient OneSignal/Resend outage silently drops
 * transactional notifications — there is no single producer and no
 * retry guarantee. The `notification_delivery_queue` + cron we built in
 * §15.4-25 is a durable retry queue, but adoption is spotty.
 *
 * This helper is the single place all callers should use. Every channel
 * goes through the queue; the cron is the only thing that actually
 * talks to OneSignal/Resend/Twilio/insertNotification. That gives us:
 *   • durable retry + DLQ for every delivery (Wave 3.3)
 *   • uniform dedupe via `dedupe_key` (migration 512)
 *   • one place to observe via Sentry
 *
 * This helper is intentionally decoupled from any specific channel
 * provider. All channel-resolution logic lives in queued-senders.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OneSignalAppType } from "@/lib/platform/secrets";

export type NotificationChannel = "email" | "push" | "sms" | "in_app";

/** Embedded in queue JSON payload for cron retries (OneSignal tenant + app). */
export type QueuePayloadMeta = {
  tenant_id?: string | null;
  push_app_type?: OneSignalAppType | null;
};

export const QUEUE_PAYLOAD_META_KEY = "_queue_meta" as const;

/** Read retry metadata stored by `enqueueNotification` (cron / workers). */
export function parseQueuePayloadMeta(payload: unknown): QueuePayloadMeta {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as Record<string, unknown>;
  const raw = p[QUEUE_PAYLOAD_META_KEY];
  if (!raw || typeof raw !== "object" || raw === null) return {};
  const m = raw as Record<string, unknown>;
  const tenant_id =
    typeof m.tenant_id === "string" && m.tenant_id.trim() ? m.tenant_id.trim() : null;
  const pt = m.push_app_type;
  const push_app_type =
    pt === "customer" || pt === "provider" ? pt : null;
  const out: QueuePayloadMeta = {};
  if (tenant_id) out.tenant_id = tenant_id;
  if (push_app_type) out.push_app_type = push_app_type;
  return out;
}

export interface EnqueueNotificationInput {
  channel: NotificationChannel;
  /**
   * Machine-readable template identifier, e.g. `booking.confirmed`,
   * `booking.reminder_24h`, `payout.paid`. Used by the cron to pick
   * the right template + by observability/dashboards to count
   * deliveries per category.
   */
  templateKey: string;
  /** Target user (nullable only for unauthenticated channels). */
  recipientUserId?: string | null;
  /** Related booking (optional). Used for joins and audit. */
  bookingId?: string | null;
  /** Related notification row (optional). */
  notificationId?: string | null;
  /**
   * Channel-specific payload. Shape conventions:
   *   • email: { subject, html, text, to? }
   *   • push:  { title, message, url?, data? }
   *   • sms:   { body, to? }
   *   • in_app:{ title, message, data? }
   * When `to` is omitted the cron resolves contact info from the user.
   */
  payload: Record<string, unknown>;
  /**
   * Stable idempotency key. Repeated enqueues with the same key will
   * be suppressed while the original row is still pending / in_flight /
   * failed-retryable. Format recommendation:
   *   `${templateKey}:${bookingId ?? 'n/a'}:${recipientUserId ?? 'n/a'}`
   *
   * Callers must include enough entropy that legitimately-repeated
   * events (e.g. a retry of the same transactional email after the
   * underlying booking row was revised) are treated as one.
   */
  dedupeKey?: string | null;
  /** Schedule delivery no earlier than this timestamp. */
  scheduleAt?: Date | null;
  /** Override default retry budget (5). */
  maxAttempts?: number;
  /** Passed through to queued push retries (`resolveOneSignalCredentials`). */
  tenantId?: string | null;
  /** For push channel: customer vs provider OneSignal app (ignored for email/sms/in_app). */
  pushAppType?: OneSignalAppType | null;
}

export interface EnqueueNotificationResult {
  /** Queue row id (may be existing row on dedupe). */
  id: string | null;
  /** true = inserted fresh, false = dedupe suppressed. */
  inserted: boolean;
  /** Non-fatal errors. */
  error?: string;
}

type AdminClient = SupabaseClient;

function admin(client?: AdminClient): AdminClient {
  return client ?? (getSupabaseAdmin() as unknown as AdminClient);
}

/**
 * Queue a notification for durable delivery. Always prefer this over
 * calling OneSignal / Resend / Twilio / insertNotification directly.
 *
 * Semantics:
 *   • Never throws on the happy path. On producer failure (DB insert
 *     fails) returns `{ id: null, inserted: false, error }` so the
 *     caller can decide whether to retry.
 *   • Dedupe is best-effort: if the unique index rejects the insert
 *     the helper resolves the existing row id and reports
 *     `inserted: false`.
 *   • Delivery is asynchronous; the cron picks the row up within ~2m.
 */
export async function enqueueNotification(
  input: EnqueueNotificationInput,
  client?: AdminClient,
): Promise<EnqueueNotificationResult> {
  const supabase = admin(client);
  const basePayload = { ...(input.payload ?? {}) } as Record<string, unknown>;
  const hasTenant =
    typeof input.tenantId === "string" && input.tenantId.trim().length > 0;
  const hasPushApp =
    input.channel === "push" &&
    (input.pushAppType === "customer" || input.pushAppType === "provider");
  if (hasTenant || hasPushApp) {
    const prev =
      basePayload[QUEUE_PAYLOAD_META_KEY] &&
      typeof basePayload[QUEUE_PAYLOAD_META_KEY] === "object" &&
      basePayload[QUEUE_PAYLOAD_META_KEY] !== null
        ? (basePayload[QUEUE_PAYLOAD_META_KEY] as Record<string, unknown>)
        : {};
    const meta: QueuePayloadMeta = {
      ...(prev as QueuePayloadMeta),
      ...(hasTenant ? { tenant_id: input.tenantId!.trim() } : {}),
      ...(hasPushApp ? { push_app_type: input.pushAppType! } : {}),
    };
    basePayload[QUEUE_PAYLOAD_META_KEY] = meta;
  }

  const row = {
    channel: input.channel,
    template_key: input.templateKey,
    recipient_user_id: input.recipientUserId ?? null,
    booking_id: input.bookingId ?? null,
    notification_id: input.notificationId ?? null,
    payload: basePayload,
    dedupe_key: input.dedupeKey ?? null,
    next_attempt_at: (input.scheduleAt ?? new Date()).toISOString(),
    max_attempts: typeof input.maxAttempts === "number" ? input.maxAttempts : 5,
  };

  const { data, error } = await supabase
    .from("notification_delivery_queue")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (!error && data?.id) {
    return { id: data.id, inserted: true };
  }

  // Dedupe collision: find the existing active row and report it.
  if (error && isUniqueViolation(error) && input.dedupeKey) {
    const { data: existing } = await supabase
      .from("notification_delivery_queue")
      .select("id")
      .eq("dedupe_key", input.dedupeKey)
      .in("status", ["pending", "in_flight", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      id: existing?.id ?? null,
      inserted: false,
    };
  }

  return {
    id: null,
    inserted: false,
    error: error?.message ?? "unknown producer error",
  };
}

/**
 * Convenience helper: fan out the same notification across multiple
 * channels for one recipient (e.g. confirm booking → in_app + email +
 * push). Each channel row has its own dedupe key derived from the
 * base key so they won't suppress each other.
 */
export async function enqueueMultiChannel(
  base: Omit<EnqueueNotificationInput, "channel" | "dedupeKey">,
  channels: NotificationChannel[],
  dedupeBase?: string,
  client?: AdminClient,
): Promise<EnqueueNotificationResult[]> {
  return Promise.all(
    channels.map((channel) =>
      enqueueNotification(
        {
          ...base,
          channel,
          dedupeKey: dedupeBase ? `${dedupeBase}:${channel}` : null,
        },
        client,
      ),
    ),
  );
}

// ───────────────────────── helpers ──────────────────────────

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : "";
  if (code === "23505") return true;
  const msg = typeof rec.message === "string" ? rec.message.toLowerCase() : "";
  return (
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    msg.includes("ux_notification_queue_dedupe_active")
  );
}
