/**
 * Option A — provider-agnostic email/SMS delivery for template notifications.
 *
 * Background
 * ----------
 * `sendTemplateNotification` historically pushed every gated channel (push,
 * email, sms) onto a single OneSignal payload. OneSignal is only wired up for
 * *push* in this product — we never create OneSignal email/SMS subscriptions
 * and the email/SMS products are not configured — so any `email`/`sms` channel
 * a template requested silently never delivered.
 *
 * This module routes the `email` and `sms` template channels onto the existing
 * durable delivery queue (`notification_delivery_queue`) instead. The cron
 * worker (`process-notification-queue`) then delivers them via Resend (email)
 * and Twilio (sms), resolving the recipient's address from the `users` table —
 * no OneSignal subscription required — with retry + DLQ semantics for free.
 *
 * Push + in-app continue to flow through OneSignal / the in-app inbox.
 *
 * The row-building logic is a pure function so it can be unit-tested without a
 * database: see `enqueue-template-channels.test.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueNotificationInput } from "@/lib/notifications/enqueue";

export type TemplateEmailSmsChannel = "email" | "sms";

export interface TemplateChannelRecipient {
  userId: string;
  /** Channels this recipient allows. Only email/sms are honoured. */
  channels: TemplateEmailSmsChannel[];
}

export interface TemplateChannelContext {
  templateKey: string;
  /**
   * Recipients to deliver to, each with their own allowed channels (per-user
   * gating). One queue row is produced per (recipient × channel).
   */
  recipients: TemplateChannelRecipient[];
  bookingId?: string | null;
  /** Tenant used by the cron to resolve Resend/Twilio credentials + branding. */
  tenantId?: string | null;
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  /** Template variables, persisted on the row for audit/observability. */
  data: Record<string, unknown>;
  url?: string;
  /** Dedupe-key namespace. Defaults to `template` (the happy-path producer). */
  dedupePrefix?: string;
}

/**
 * Build the durable-queue rows for the email/SMS channels of a template send.
 *
 * Pure + deterministic — no I/O. Returns one `EnqueueNotificationInput` per
 * (recipient × channel) whose content is non-empty. Each recipient carries its
 * own allowed channels (per-user gating); channels other than email/sms are
 * ignored (push/in-app are handled elsewhere).
 */
export function buildTemplateChannelQueueRows(
  ctx: TemplateChannelContext,
): EnqueueNotificationInput[] {
  const prefix = ctx.dedupePrefix?.trim() || "template";
  const rows: EnqueueNotificationInput[] = [];

  for (const recipient of ctx.recipients) {
    const userId = recipient?.userId;
    if (!userId) continue;
    const channels = Array.from(new Set(recipient.channels ?? [])).filter(
      (c): c is TemplateEmailSmsChannel => c === "email" || c === "sms",
    );
    for (const channel of channels) {
      const payload = buildTemplateChannelPayload(channel, ctx);
      if (!payload) continue; // nothing to deliver on this channel — skip
      rows.push({
        channel,
        templateKey: ctx.templateKey,
        recipientUserId: userId,
        bookingId: ctx.bookingId ?? null,
        tenantId: ctx.tenantId ?? null,
        payload,
        dedupeKey: `${prefix}:${ctx.templateKey}:${userId}:${channel}:${ctx.bookingId ?? "none"}`,
      });
    }
  }
  return rows;
}

/**
 * Channel-specific payload matching the contracts the queued senders read:
 *   • email → { subject, html, body }  (queued-senders: subject/ html / text=body)
 *   • sms   → { body }                 (queued-senders: body)
 * `data` is carried for audit. Returns null when there is no content to send.
 */
function buildTemplateChannelPayload(
  channel: TemplateEmailSmsChannel,
  ctx: TemplateChannelContext,
): Record<string, unknown> | null {
  if (channel === "email") {
    const subject = ctx.emailSubject || ctx.title || "";
    const html = ctx.emailBody || ctx.body || "";
    if (!subject && !html) return null;
    return { subject, html, body: html, data: ctx.data };
  }
  const smsBody = ctx.smsBody || ctx.body || "";
  if (!smsBody) return null;
  return { body: smsBody, data: ctx.data };
}

/**
 * Enqueue the email/SMS channels of a template notification for durable
 * delivery. Never throws — producer failures are swallowed (and surfaced by
 * `enqueueNotification`'s result) so a queue hiccup can't break the push path.
 */
export async function enqueueTemplateEmailSmsChannels(
  ctx: TemplateChannelContext,
  client?: SupabaseClient,
): Promise<{ enqueued: number; suppressed: number }> {
  const rows = buildTemplateChannelQueueRows(ctx);
  if (rows.length === 0) return { enqueued: 0, suppressed: 0 };

  try {
    const { enqueueNotification } = await import("@/lib/notifications/enqueue");
    const results = await Promise.all(rows.map((row) => enqueueNotification(row, client)));
    let enqueued = 0;
    let suppressed = 0;
    for (const r of results) {
      if (r.inserted) enqueued += 1;
      else suppressed += 1;
    }
    return { enqueued, suppressed };
  } catch (err) {
    console.error("[notifications] failed to enqueue template email/SMS", err);
    return { enqueued: 0, suppressed: 0 };
  }
}
