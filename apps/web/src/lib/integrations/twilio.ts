import { SupabaseClient } from "@supabase/supabase-js";

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  whatsappFrom: string;
}

/**
 * Resolve Twilio credentials for a tenant.
 * Priority: platform_secrets (DB) → environment variables.
 */
export async function resolveTwilioCredentials(
  supabase: SupabaseClient,
  tenantId: string
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

  // Fall back to env vars
  accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || "";
  authToken = authToken || process.env.TWILIO_AUTH_TOKEN || "";
  smsFrom = smsFrom || process.env.TWILIO_SMS_FROM || "";
  whatsappFrom = whatsappFrom || process.env.TWILIO_WHATSAPP_FROM || "";

  if (!accountSid || !authToken) return null;

  return { accountSid, authToken, smsFrom, whatsappFrom };
}

/**
 * Send SMS via Twilio REST API.
 */
export async function sendTwilioSMS(
  creds: TwilioCredentials,
  to: string,
  body: string
): Promise<Record<string, unknown>> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: to,
    From: creds.smsFrom,
    Body: body,
  });

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
 * Send WhatsApp message via Twilio REST API.
 */
export async function sendTwilioWhatsApp(
  creds: TwilioCredentials,
  to: string,
  body: string
): Promise<Record<string, unknown>> {
  const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const whatsappFrom = creds.whatsappFrom.startsWith("whatsapp:")
    ? creds.whatsappFrom
    : `whatsapp:${creds.whatsappFrom}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: whatsappTo,
    From: whatsappFrom,
    Body: body,
  });

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
