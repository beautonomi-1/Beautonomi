import { SupabaseClient } from "@supabase/supabase-js";

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  whatsappFrom: string;
  messagingServiceSid: string;
  whatsappSandboxEnabled: boolean;
}

function statusCallbackUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/webhooks/twilio`;
}

async function readTwilioSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ messagingServiceSid: string; whatsappSandboxEnabled: boolean }> {
  let messagingServiceSid = "";
  let whatsappSandboxEnabled = false;

  try {
    let query = supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data } = await query.maybeSingle();
    const twilio = (data?.settings as { twilio?: Record<string, unknown> } | undefined)?.twilio;
    if (twilio) {
      messagingServiceSid = String(twilio.message_service_sid ?? "").trim();
      whatsappSandboxEnabled = twilio.whatsapp_sandbox_enabled === true;
    }
  } catch {
    // dev partial DB
  }

  messagingServiceSid =
    messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";

  return { messagingServiceSid, whatsappSandboxEnabled };
}

/**
 * Resolve Twilio credentials for a tenant.
 * Priority: platform_secrets (DB) → environment variables.
 */
export async function resolveTwilioCredentials(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TwilioCredentials | null> {
  let accountSid = "";
  let authToken = "";
  let smsFrom = "";
  let whatsappFrom = "";

  try {
    let query = supabase
      .from("platform_secrets")
      .select("twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from")
      .order("updated_at", { ascending: false })
      .limit(1);

    query = query.eq("tenant_id", tenantId);
    const { data } = await query.maybeSingle();

    if (!data) {
      const { data: globalRow } = await supabase
        .from("platform_secrets")
        .select("twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from")
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (globalRow) {
        accountSid = (globalRow as Record<string, string>).twilio_account_sid || "";
        authToken = (globalRow as Record<string, string>).twilio_auth_token || "";
        smsFrom = (globalRow as Record<string, string>).twilio_sms_from || "";
        whatsappFrom = (globalRow as Record<string, string>).twilio_whatsapp_from || "";
      }
    } else {
      accountSid = (data as Record<string, string>).twilio_account_sid || "";
      authToken = (data as Record<string, string>).twilio_auth_token || "";
      smsFrom = (data as Record<string, string>).twilio_sms_from || "";
      whatsappFrom = (data as Record<string, string>).twilio_whatsapp_from || "";
    }
  } catch {
    // DB might not have columns yet in dev
  }

  accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || "";
  authToken = authToken || process.env.TWILIO_AUTH_TOKEN || "";
  smsFrom = smsFrom || process.env.TWILIO_SMS_FROM || "";
  whatsappFrom = whatsappFrom || process.env.TWILIO_WHATSAPP_FROM || "";

  if (!accountSid || !authToken) return null;

  const settings = await readTwilioSettings(supabase, tenantId);

  return {
    accountSid,
    authToken,
    smsFrom,
    whatsappFrom,
    messagingServiceSid: settings.messagingServiceSid,
    whatsappSandboxEnabled: settings.whatsappSandboxEnabled,
  };
}

/**
 * Send SMS via Twilio REST API.
 */
export async function sendTwilioSMS(
  creds: TwilioCredentials,
  to: string,
  body: string,
): Promise<Record<string, unknown>> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: to,
    From: creds.smsFrom,
    Body: body,
  });
  const cb = statusCallbackUrl();
  if (cb) params.set("StatusCallback", cb);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.message as string) || "Failed to send SMS via Twilio");
  }
  return data;
}

/**
 * Send WhatsApp message via Twilio REST API (free-form Body, in-session only).
 */
export async function sendTwilioWhatsApp(
  creds: TwilioCredentials,
  to: string,
  body: string,
): Promise<Record<string, unknown>> {
  const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const whatsappFrom = resolveWhatsAppFrom(creds);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: whatsappTo,
    From: whatsappFrom,
    Body: body,
  });
  const cb = statusCallbackUrl();
  if (cb) params.set("StatusCallback", cb);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.message as string) || "Failed to send WhatsApp via Twilio");
  }
  return data;
}

function resolveWhatsAppFrom(creds: TwilioCredentials): string {
  const raw = creds.whatsappSandboxEnabled
    ? process.env.TWILIO_WHATSAPP_SANDBOX_FROM?.trim() || "whatsapp:+14155238886"
    : creds.whatsappFrom;
  return raw.startsWith("whatsapp:") ? raw : `whatsapp:${raw}`;
}

export interface WhatsAppTemplateSendOptions {
  contentSid: string;
  contentVariables: Record<string, string>;
  statusCallback?: string;
}

/**
 * Send WhatsApp via Twilio Content API (approved template).
 */
export async function sendTwilioWhatsAppTemplate(
  creds: TwilioCredentials,
  to: string,
  options: WhatsAppTemplateSendOptions,
): Promise<Record<string, unknown>> {
  if (!creds.messagingServiceSid?.trim()) {
    throw new Error("Messaging Service SID (MG...) is required for WhatsApp Content sends");
  }

  const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: whatsappTo,
    MessagingServiceSid: creds.messagingServiceSid,
    ContentSid: options.contentSid,
    ContentVariables: JSON.stringify(options.contentVariables),
  });

  const cb = options.statusCallback || statusCallbackUrl();
  if (cb) params.set("StatusCallback", cb);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data.message as string) || "Failed to send WhatsApp template via Twilio");
  }
  return data;
}

/** Non-retryable WhatsApp skip (waterfall / dead-letter without infinite retry). */
export class WhatsAppSkipError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppSkipError";
  }
}
