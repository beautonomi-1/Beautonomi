/**
 * §15.4-25 (audit 2026-04) — Channel-specific senders for the durable
 * notification retry queue (`notification_delivery_queue`).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTwilioCredentials, sendTwilioSMS } from "@/lib/integrations/twilio";
import { sendQueuedEmailViaProvider } from "@/lib/notifications/queued-email-provider";

export interface QueuedNotificationRow {
  id: string;
  channel: "email" | "push" | "sms" | "in_app";
  template_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  recipient_user_id: string | null;
  booking_id: string | null;
  notification_id: string | null;
}

const subjectOf = (row: QueuedNotificationRow): string =>
  String(row.payload?.subject ?? row.payload?.title ?? "Beautonomi");

const bodyOf = (row: QueuedNotificationRow): string =>
  String(row.payload?.body ?? row.payload?.message ?? "");

async function resolveUserContact(
  userId: string,
): Promise<{ email: string | null; phone: string | null } | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("users")
    .select("email, phone")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    email: typeof data.email === "string" ? data.email : null,
    phone: typeof data.phone === "string" ? data.phone : null,
  };
}

function tenantIdFromPayload(row: QueuedNotificationRow): string {
  const meta = row.payload?._queue_meta as { tenant_id?: string } | undefined;
  return meta?.tenant_id?.trim() || "";
}

export async function sendQueuedEmail(row: QueuedNotificationRow): Promise<void> {
  let toEmail = (row.payload?.to as string | undefined) ?? null;
  if (!toEmail && row.recipient_user_id) {
    const contact = await resolveUserContact(row.recipient_user_id);
    toEmail = contact?.email ?? null;
  }
  if (!toEmail) {
    throw new Error("no email address available for recipient");
  }

  await sendQueuedEmailViaProvider(
    {
      to: toEmail,
      subject: subjectOf(row),
      html: (row.payload?.html as string | undefined) ?? bodyOf(row),
      text: bodyOf(row),
      from: row.payload?.from as string | undefined,
      templateKey: row.template_key,
      queueRowId: row.id,
    },
    { tenantId: tenantIdFromPayload(row) || null },
  );
}

export async function sendQueuedSms(row: QueuedNotificationRow): Promise<void> {
  let toNumber = (row.payload?.to as string | undefined) ?? null;
  if (!toNumber && row.recipient_user_id) {
    const contact = await resolveUserContact(row.recipient_user_id);
    toNumber = contact?.phone ?? null;
  }
  if (!toNumber) {
    throw new Error("no phone number available for recipient");
  }

  const supabase = getSupabaseAdmin();
  const tenantId = tenantIdFromPayload(row);
  const creds = await resolveTwilioCredentials(supabase, tenantId);
  if (!creds?.smsFrom) {
    throw new Error("sms provider not configured (Twilio credentials or TWILIO_SMS_FROM missing)");
  }

  await sendTwilioSMS(creds, toNumber, bodyOf(row));
}
