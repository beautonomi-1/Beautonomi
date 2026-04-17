/**
 * §15.4-25 (audit 2026-04) — Channel-specific senders for the durable
 * notification retry queue (`notification_delivery_queue`).
 *
 * These are intentionally thin shims. The queue cron
 * (`/api/cron/process-notification-queue`) routes rows to the right
 * sender based on `channel`. Each sender resolves the recipient's
 * contact info, dispatches the actual message through whatever backend
 * is configured (Resend/SES for email, Twilio/Africa's Talking for SMS),
 * and throws on failure so the cron marks the row `failed` and schedules
 * a retry with backoff.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export async function sendQueuedEmail(row: QueuedNotificationRow): Promise<void> {
  const providerKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.EMAIL_PROVIDER_API_KEY?.trim() ||
    "";
  if (!providerKey) {
    // Missing provider → fail fast so the cron keeps the row in `failed`
    // and doesn't fake delivery.
    throw new Error("email provider not configured (RESEND_API_KEY missing)");
  }

  let toEmail = (row.payload?.to as string | undefined) ?? null;
  if (!toEmail && row.recipient_user_id) {
    const contact = await resolveUserContact(row.recipient_user_id);
    toEmail = contact?.email ?? null;
  }
  if (!toEmail) {
    throw new Error("no email address available for recipient");
  }

  const fromAddress =
    (row.payload?.from as string | undefined) ??
    process.env.EMAIL_FROM_ADDRESS ??
    "Beautonomi <notifications@beautonomi.app>";

  // Resend HTTP API — keeps this file free of hard SDK deps.
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: toEmail,
      subject: subjectOf(row),
      html: (row.payload?.html as string | undefined) ?? bodyOf(row),
      text: bodyOf(row),
      headers: {
        "X-Beautonomi-Template": row.template_key,
        "X-Beautonomi-Queue-Row": row.id,
      },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`email send failed (${resp.status}): ${text.slice(0, 400)}`);
  }
}

export async function sendQueuedSms(row: QueuedNotificationRow): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() || "";
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("sms provider not configured (TWILIO_* missing)");
  }

  let toNumber = (row.payload?.to as string | undefined) ?? null;
  if (!toNumber && row.recipient_user_id) {
    const contact = await resolveUserContact(row.recipient_user_id);
    toNumber = contact?.phone ?? null;
  }
  if (!toNumber) {
    throw new Error("no phone number available for recipient");
  }

  const form = new URLSearchParams();
  form.set("To", toNumber);
  form.set("From", fromNumber);
  form.set("Body", bodyOf(row));

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`sms send failed (${resp.status}): ${text.slice(0, 400)}`);
  }
}
