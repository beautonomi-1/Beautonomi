import { parseQueuePayloadMeta } from "@/lib/notifications/enqueue";
import type { QueuedNotificationRow } from "@/lib/notifications/queued-senders";

export type QueueDeliveryResult = { ok: true } | { ok: false; error: string };

/**
 * Deliver a single notification_delivery_queue row via the appropriate channel.
 * Used by the queue cron and unit/integration tests.
 */
export async function deliverQueueRow(
  row: QueuedNotificationRow,
): Promise<QueueDeliveryResult> {
  try {
    if (row.channel === "in_app") {
      const { insertNotification } = await import(
        "@/lib/notifications/insert-notification"
      );
      if (!row.recipient_user_id) {
        return { ok: false, error: "recipient_user_id missing for in_app" };
      }
      await insertNotification({
        user_id: row.recipient_user_id,
        type: row.template_key,
        title: String(row.payload?.title ?? "Notification"),
        message: String(row.payload?.message ?? ""),
        data: (row.payload?.data as Record<string, unknown>) ?? {},
      });
      return { ok: true };
    }

    if (row.channel === "push") {
      const { sendToUser } = await import("@/lib/notifications/onesignal").catch(
        () => ({
          sendToUser: null as unknown as (
            userId: string,
            payload: {
              title: string;
              message: string;
              url?: string;
              data?: Record<string, unknown>;
            },
            channels?: unknown,
            opts?: unknown,
          ) => Promise<{ success: boolean; error?: string }>,
        }),
      );
      if (!sendToUser || !row.recipient_user_id) {
        return { ok: false, error: "push sender unavailable or missing recipient" };
      }
      const meta = parseQueuePayloadMeta(row.payload);
      const sendOpts =
        meta.push_app_type || meta.tenant_id
          ? {
              ...(meta.push_app_type ? { appType: meta.push_app_type } : {}),
              ...(meta.tenant_id ? { tenantId: meta.tenant_id } : {}),
            }
          : undefined;
      const pushResult = await sendToUser(
        row.recipient_user_id,
        {
          title: String(row.payload?.title ?? "Beautonomi"),
          message: String(row.payload?.message ?? ""),
          url: row.payload?.url ? String(row.payload.url) : undefined,
          data: (row.payload?.data as Record<string, unknown>) ?? {},
        },
        ["push"],
        {
          ...(sendOpts ?? {}),
          skipMustDeliverRetryEnqueue: true,
        },
      );
      if (!pushResult.success) {
        return {
          ok: false,
          error: pushResult.error ?? "push send failed",
        };
      }
      return { ok: true };
    }

    if (row.channel === "email") {
      const { sendQueuedEmail } = await import(
        "@/lib/notifications/queued-senders"
      );
      await sendQueuedEmail(row);
      return { ok: true };
    }

    if (row.channel === "sms") {
      const { sendQueuedSms } = await import(
        "@/lib/notifications/queued-senders"
      );
      await sendQueuedSms(row);
      return { ok: true };
    }

    if (row.channel === "whatsapp") {
      const { sendQueuedWhatsApp } = await import(
        "@/lib/notifications/queued-senders"
      );
      const { WhatsAppSkipError } = await import("@/lib/integrations/twilio");
      try {
        await sendQueuedWhatsApp(row);
        return { ok: true };
      } catch (err) {
        if (err instanceof WhatsAppSkipError) {
          return { ok: false, error: err.message };
        }
        throw err;
      }
    }

    return { ok: false, error: `unknown channel: ${row.channel}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
