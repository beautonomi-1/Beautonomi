/**
 * Fresha-style channel waterfall: on WhatsApp terminal failure, enqueue next channel.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueueNotification } from "@/lib/notifications/enqueue";

const TERMINAL_STATUSES = new Set(["failed", "undelivered", "canceled"]);

const TEMPLATE_STATUS_ERRORS: Record<string, string> = {
  "63040": "rejected",
  "63041": "paused",
  "63042": "disabled",
};

export async function updateWhatsAppDeliveryLog(input: {
  messageSid: string;
  status: string;
  errorCode?: string | null;
}): Promise<{ queueRowId: string | null; templateKey: string | null }> {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("whatsapp_delivery_log")
    .select("queue_row_id, template_key, content_sid")
    .eq("message_sid", input.messageSid)
    .maybeSingle();

  await supabase
    .from("whatsapp_delivery_log")
    .update({
      status: input.status,
      error_code: input.errorCode ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("message_sid", input.messageSid);

  if (input.errorCode && existing?.content_sid) {
    const mapped = TEMPLATE_STATUS_ERRORS[input.errorCode];
    if (mapped) {
      await supabase
        .from("notification_templates")
        .update({
          whatsapp_template_status: mapped,
          whatsapp_content_error: `Twilio error ${input.errorCode}`,
          updated_at: new Date().toISOString(),
        })
        .eq("whatsapp_content_sid", existing.content_sid);

      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(`WhatsApp template ${mapped} (error ${input.errorCode})`, {
          level: "warning",
          extra: {
            content_sid: existing.content_sid,
            template_key: existing.template_key,
            message_sid: input.messageSid,
          },
        });
      } catch {
        // Sentry optional
      }
    }
  }

  return {
    queueRowId: existing?.queue_row_id ?? null,
    templateKey: existing?.template_key ?? null,
  };
}

export async function maybeEnqueueWaterfallFallback(queueRowId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: queueRow } = await supabase
    .from("notification_delivery_queue")
    .select("*")
    .eq("id", queueRowId)
    .maybeSingle();

  if (!queueRow || queueRow.channel !== "whatsapp") return;

  const templateKey = queueRow.template_key as string;
  const queueTenantId = (queueRow.tenant_id as string | null) ?? null;
  let templateQuery = supabase
    .from("notification_templates")
    .select("channel_waterfall, sms_body, email_subject, email_body, body, title")
    .eq("key", templateKey);
  if (queueTenantId) {
    templateQuery = templateQuery.or(`tenant_id.eq.${queueTenantId},tenant_id.is.null`);
  } else {
    templateQuery = templateQuery.is("tenant_id", null);
  }
  const { data: templates } = await templateQuery.limit(5);
  const template =
    (templates ?? []).find((t) => (t as { tenant_id?: string | null }).tenant_id === queueTenantId) ??
    (templates ?? []).find((t) => !(t as { tenant_id?: string | null }).tenant_id) ??
    null;

  let waterfall: string[] = Array.isArray(template?.channel_waterfall)
    ? (template.channel_waterfall as string[])
    : ["whatsapp", "sms", "email"];
  if (waterfall.length === 0) {
    waterfall = ["whatsapp", "sms", "email"];
  }

  const currentIdx = waterfall.indexOf("whatsapp");
  if (currentIdx < 0 || currentIdx >= waterfall.length - 1) return;

  const nextChannel = waterfall[currentIdx + 1];
  if (nextChannel !== "sms" && nextChannel !== "email") return;

  const payload = (queueRow.payload as Record<string, unknown>) ?? {};
  const meta = payload._queue_meta;
  const recipientUserId = queueRow.recipient_user_id as string | null;
  const bookingId = queueRow.booking_id as string | null;

  let nextPayload: Record<string, unknown> = { data: payload.data ?? {} };
  if (nextChannel === "sms") {
    let body = String(
      template?.sms_body ?? template?.body ?? payload.body ?? "",
    );
    const data = (payload.data as Record<string, unknown> | undefined) ?? {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" || typeof value === "number") {
        body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
    }
    const portalUrl = typeof data.portal_url === "string" ? data.portal_url : "";
    if (portalUrl) {
      body = body.replace(/\{\{portal_url\}\}/g, portalUrl);
    }
    if (!body) return;
    const to = typeof payload.to === "string" ? payload.to : undefined;
    nextPayload = { body, data: payload.data ?? {}, ...(to ? { to } : {}) };
  } else {
    const subject = String(template?.email_subject ?? template?.title ?? "Beautonomi");
    const html = String(template?.email_body ?? template?.body ?? "");
    if (!subject && !html) return;
    nextPayload = { subject, html, body: html, data: payload.data ?? {} };
  }

  const dedupeKey = `waterfall:${templateKey}:${recipientUserId}:${nextChannel}:${bookingId ?? "none"}:${queueRowId}`;

  await enqueueNotification({
    channel: nextChannel as "sms" | "email",
    templateKey,
    recipientUserId: recipientUserId ?? undefined,
    bookingId: bookingId ?? undefined,
    payload: { ...nextPayload, _queue_meta: meta },
    dedupeKey,
  });
}

export async function handleWhatsAppStatusCallback(input: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
}): Promise<void> {
  const { queueRowId } = await updateWhatsAppDeliveryLog({
    messageSid: input.messageSid,
    status: input.messageStatus,
    errorCode: input.errorCode,
  });

  if (!TERMINAL_STATUSES.has(input.messageStatus.toLowerCase())) return;
  if (!queueRowId) return;

  await maybeEnqueueWaterfallFallback(queueRowId);
}

/** Terminal WhatsApp skip: SMS/email fallback now, do not retry the WA row. */
export async function handleWhatsAppQueueSkip(
  queueRowId: string,
  skipReason: string,
): Promise<void> {
  await maybeEnqueueWaterfallFallback(queueRowId);
  const supabase = getSupabaseAdmin();
  await supabase
    .from("notification_delivery_queue")
    .update({
      status: "delivered",
      last_error: `whatsapp_skip: ${skipReason}`.slice(0, 2000),
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueRowId);
}
