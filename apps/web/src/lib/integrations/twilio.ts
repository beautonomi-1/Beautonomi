import { createHmac, timingSafeEqual } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  whatsappFrom: string;
  messagingServiceSid: string;
  whatsappSandboxEnabled: boolean;
}

export interface TwilioVoiceCredentials {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  voiceFrom: string;
}

export interface TwilioPhoneLookupResult {
  status: "valid" | "invalid" | "unknown";
  lineType: string | null;
  phoneNumber: string | null;
  raw?: Record<string, unknown>;
}

/** Reuse cached Lookup results for 7 days to limit Twilio API spend. */
export const PHONE_LOOKUP_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const VOICE_TOKEN_TTL_SECONDS = 3600;

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://beautonomi.com").replace(
    /\/$/,
    "",
  );
}

function statusCallbackUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/webhooks/twilio`;
}

export function voiceTwimlUrl(): string {
  return `${appBaseUrl()}/api/webhooks/twilio/voice`;
}

export function voiceStatusCallbackUrl(
  leadId: string,
  tenantId: string,
  adminUserId: string,
): string {
  const params = new URLSearchParams({
    lead_id: leadId,
    tenant_id: tenantId,
    admin_id: adminUserId,
  });
  return `${appBaseUrl()}/api/webhooks/twilio/voice/status?${params.toString()}`;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Validate Twilio webhook signature (HMAC-SHA1 over URL + sorted params).
 */
export function validateTwilioWebhookSignature(
  authToken: string,
  signature: string,
  url: string,
  params: URLSearchParams,
): boolean {
  if (!signature) return false;
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join("");
  const expected = createHmac("sha1", authToken)
    .update(url + sortedParams)
    .digest("base64");

  const sigBuf = Buffer.from(signature, "base64");
  const expectedBuf = Buffer.from(expected, "base64");
  if (sigBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(sigBuf, expectedBuf);
}

/**
 * Auth token used to validate Twilio webhook signatures.
 * Priority: tenant platform_secrets → global platform_secrets → env.
 */
export async function resolveTwilioWebhookAuthToken(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  let authToken = "";

  try {
    if (tenantId) {
      const { data } = await supabase
        .from("platform_secrets")
        .select("twilio_auth_token")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      authToken = (data as { twilio_auth_token?: string } | null)?.twilio_auth_token || "";
    }

    if (!authToken) {
      const { data: globalRow } = await supabase
        .from("platform_secrets")
        .select("twilio_auth_token")
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      authToken =
        (globalRow as { twilio_auth_token?: string } | null)?.twilio_auth_token || "";
    }
  } catch {
    // dev partial DB
  }

  return authToken || process.env.TWILIO_AUTH_TOKEN || null;
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

/**
 * Resolve Twilio Voice credentials (API key + TwiML app + caller ID).
 * Priority: platform_secrets (DB) → environment variables.
 */
export async function resolveTwilioVoiceCredentials(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TwilioVoiceCredentials | null> {
  const selectCols =
    "twilio_account_sid, twilio_auth_token, twilio_api_key_sid, twilio_api_key_secret, twilio_twiml_app_sid, twilio_voice_from";

  let accountSid = "";
  let authToken = "";
  let apiKeySid = "";
  let apiKeySecret = "";
  let twimlAppSid = "";
  let voiceFrom = "";

  try {
    let query = supabase
      .from("platform_secrets")
      .select(selectCols)
      .order("updated_at", { ascending: false })
      .limit(1);

    query = query.eq("tenant_id", tenantId);
    const { data } = await query.maybeSingle();

    const row =
      data ??
      (
        await supabase
          .from("platform_secrets")
          .select(selectCols)
          .is("tenant_id", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data;

    if (row) {
      const r = row as Record<string, string>;
      accountSid = r.twilio_account_sid || "";
      authToken = r.twilio_auth_token || "";
      apiKeySid = r.twilio_api_key_sid || "";
      apiKeySecret = r.twilio_api_key_secret || "";
      twimlAppSid = r.twilio_twiml_app_sid || "";
      voiceFrom = r.twilio_voice_from || "";
    }
  } catch {
    // dev partial DB
  }

  accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || "";
  authToken = authToken || process.env.TWILIO_AUTH_TOKEN || "";
  apiKeySid = apiKeySid || process.env.TWILIO_API_KEY_SID || "";
  apiKeySecret = apiKeySecret || process.env.TWILIO_API_KEY_SECRET || "";
  twimlAppSid = twimlAppSid || process.env.TWILIO_TWIML_APP_SID || "";
  voiceFrom = voiceFrom || process.env.TWILIO_VOICE_FROM || "";

  if (!accountSid || !authToken || !apiKeySid || !apiKeySecret || !twimlAppSid || !voiceFrom) {
    return null;
  }

  return {
    accountSid,
    authToken,
    apiKeySid,
    apiKeySecret,
    twimlAppSid,
    voiceFrom,
  };
}

/**
 * Twilio Lookup v2 — validates a number and returns line type intelligence.
 */
export async function lookupPhone(
  creds: Pick<TwilioCredentials, "accountSid" | "authToken">,
  phoneE164: string,
): Promise<TwilioPhoneLookupResult> {
  const encoded = encodeURIComponent(phoneE164);
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encoded}?Fields=line_type_intelligence`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`,
    },
  });

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const code = Number(data.code);
    if (code === 20404) {
      return { status: "invalid", lineType: null, phoneNumber: phoneE164, raw: data };
    }
    throw new Error((data.message as string) || "Twilio Lookup failed");
  }

  const valid = data.valid === true;
  const lineIntel = data.line_type_intelligence as { type?: string } | undefined;
  const lineType = lineIntel?.type?.trim() || null;

  return {
    status: valid ? "valid" : "invalid",
    lineType,
    phoneNumber: (data.phone_number as string) || phoneE164,
    raw: data,
  };
}

export function isPhoneLookupCacheFresh(lookupAt: string | null | undefined): boolean {
  if (!lookupAt) return false;
  const at = new Date(lookupAt).getTime();
  if (Number.isNaN(at)) return false;
  return Date.now() - at < PHONE_LOOKUP_CACHE_MS;
}

/**
 * Generate a Twilio Voice SDK access token (JWT, HS256).
 * Identity should be the admin user id so status callbacks can attribute calls.
 */
export function generateTwilioVoiceAccessToken(
  creds: TwilioVoiceCredentials,
  identity: string,
  ttlSeconds: number = VOICE_TOKEN_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${creds.apiKeySid}-${creds.accountSid}-${now}`,
    iss: creds.apiKeySid,
    sub: creds.accountSid,
    iat: now,
    exp: now + ttlSeconds,
    grants: {
      identity,
      voice: {
        outgoing: { application_sid: creds.twimlAppSid },
        incoming: { allow: true },
      },
    },
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac("sha256", creds.apiKeySecret)
    .update(signingInput)
    .digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/** Non-retryable WhatsApp skip (waterfall / dead-letter without infinite retry). */
export class WhatsAppSkipError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppSkipError";
  }
}
