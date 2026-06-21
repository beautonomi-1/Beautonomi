/**
 * Option A — provider-agnostic email/SMS/WhatsApp delivery for template notifications.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnqueueNotificationInput } from "@/lib/notifications/enqueue";

export type TemplateOutboundChannel = "email" | "sms" | "whatsapp";

export interface TemplateChannelRecipient {
  userId: string;
  channels: TemplateOutboundChannel[];
}

export interface TemplateChannelContext {
  templateKey: string;
  recipients: TemplateChannelRecipient[];
  bookingId?: string | null;
  tenantId?: string | null;
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  whatsappContentSid?: string | null;
  whatsappContentVariables?: Record<string, string>;
  whatsappCategory?: string | null;
  whatsappBody?: string | null;
  whatsappTemplateStatus?: string | null;
  data: Record<string, unknown>;
  url?: string;
  dedupePrefix?: string;
}

export function buildTemplateChannelQueueRows(
  ctx: TemplateChannelContext,
): EnqueueNotificationInput[] {
  const prefix = ctx.dedupePrefix?.trim() || "template";
  const rows: EnqueueNotificationInput[] = [];

  for (const recipient of ctx.recipients) {
    const userId = recipient?.userId;
    if (!userId) continue;
    const channels = Array.from(new Set(recipient.channels ?? [])).filter(
      (c): c is TemplateOutboundChannel =>
        c === "email" || c === "sms" || c === "whatsapp",
    );
    for (const channel of channels) {
      const payload = buildTemplateChannelPayload(channel, ctx);
      if (!payload) continue;
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

function buildTemplateChannelPayload(
  channel: TemplateOutboundChannel,
  ctx: TemplateChannelContext,
): Record<string, unknown> | null {
  if (channel === "email") {
    const subject = ctx.emailSubject || ctx.title || "";
    const html = ctx.emailBody || ctx.body || "";
    if (!subject && !html) return null;
    return { subject, html, body: html, data: ctx.data };
  }

  if (channel === "whatsapp") {
    const contentSid = ctx.whatsappContentSid?.trim();
    const fallbackBody = ctx.whatsappBody || ctx.smsBody || ctx.body || "";
    if (!contentSid && !fallbackBody) return null;
    return {
      content_sid: contentSid || null,
      content_variables: ctx.whatsappContentVariables ?? {},
      category: ctx.whatsappCategory ?? "utility",
      template_status: ctx.whatsappTemplateStatus ?? "unknown",
      body: fallbackBody,
      data: ctx.data,
    };
  }

  const smsBody = ctx.smsBody || ctx.body || "";
  if (!smsBody) return null;
  return { body: smsBody, data: ctx.data };
}

/** @deprecated use buildTemplateChannelQueueRows — kept for imports */
export type TemplateEmailSmsChannel = "email" | "sms";

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
    console.error("[notifications] failed to enqueue template outbound channels", err);
    return { enqueued: 0, suppressed: 0 };
  }
}
