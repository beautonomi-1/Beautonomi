/**
 * Pluggable transactional email for the notification queue.
 * Default: Resend. Optional: SendGrid (Twilio SendGrid API).
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveResendCredentials } from "@/lib/integrations/resend";

export type QueuedEmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  templateKey: string;
  queueRowId: string;
};

export type QueuedEmailSendOptions = {
  tenantId?: string | null;
};

function resolveEmailProvider(): "resend" | "sendgrid" {
  const raw = (process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();
  return raw === "sendgrid" ? "sendgrid" : "resend";
}

async function sendViaResend(
  payload: QueuedEmailPayload,
  options?: QueuedEmailSendOptions,
): Promise<void> {
  const creds = await resolveResendCredentials(getSupabaseAdmin(), options?.tenantId);
  if (!creds) {
    throw new Error("email provider not configured (Resend API key missing)");
  }

  const fromAddress = payload.from ?? creds.fromAddress;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      headers: {
        "X-Beautonomi-Template": payload.templateKey,
        "X-Beautonomi-Queue-Row": payload.queueRowId,
      },
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`email send failed (${resp.status}): ${text.slice(0, 400)}`);
  }
}

async function sendViaSendGrid(payload: QueuedEmailPayload): Promise<void> {
  const apiKey =
    process.env.SENDGRID_API_KEY?.trim() ||
    process.env.EMAIL_PROVIDER_API_KEY?.trim() ||
    "";
  if (!apiKey) {
    throw new Error("email provider not configured (SENDGRID_API_KEY missing)");
  }

  const fromAddress = payload.from ?? process.env.EMAIL_FROM_ADDRESS ?? "notifications@beautonomi.app";

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: fromAddress.replace(/^.*<([^>]+)>.*$/, "$1").trim() || fromAddress },
      subject: payload.subject,
      content: [
        { type: "text/plain", value: payload.text },
        { type: "text/html", value: payload.html },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`sendgrid send failed (${resp.status}): ${text.slice(0, 400)}`);
  }
}

export async function sendQueuedEmailViaProvider(
  payload: QueuedEmailPayload,
  options?: QueuedEmailSendOptions,
): Promise<void> {
  const provider = resolveEmailProvider();
  if (provider === "sendgrid") {
    await sendViaSendGrid(payload);
  } else {
    await sendViaResend(payload, options);
  }
}
