import { getSupabaseClient } from "@/lib/supabase/client";

export class AuthOtpError extends Error {
  captchaRequired: boolean;
  status: number;

  constructor(message: string, options?: { captchaRequired?: boolean; status?: number }) {
    super(message);
    this.name = "AuthOtpError";
    this.captchaRequired = options?.captchaRequired === true;
    this.status = options?.status ?? 400;
  }
}

async function applySessionFromPayload(json: {
  data?: { session?: { access_token?: string; refresh_token?: string } };
}) {
  const supabase = getSupabaseClient();
  const session = json?.data?.session;
  if (session?.access_token && session?.refresh_token && supabase) {
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Lock") && message.includes("stole it")) {
        return;
      }
      throw err;
    }
  }
}

export async function sendAuthOtp(params: {
  email?: string;
  phone?: string;
  captchaToken?: string;
}): Promise<void> {
  const res = await fetch("/api/auth/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      email: params.email,
      phone: params.phone,
      captcha_token: params.captchaToken,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok === false) {
    throw new AuthOtpError(
      typeof json?.error === "string" ? json.error : "Unable to send a verification code. Please try again.",
      { captchaRequired: json?.captcha_required === true, status: res.status },
    );
  }
}

export async function verifyAuthOtp(params: {
  email?: string;
  phone?: string;
  token: string;
  type: "email" | "sms" | "signup";
}): Promise<{ identities: { provider?: string }[] }> {
  const res = await fetch("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      email: params.email,
      phone: params.phone,
      token: params.token,
      type: params.type,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok === false) {
    throw new AuthOtpError(
      typeof json?.error === "string" ? json.error : "Invalid or expired code.",
      { status: res.status },
    );
  }
  await applySessionFromPayload(json);
  const identities = Array.isArray(json?.data?.identities) ? json.data.identities : [];
  return { identities };
}

export async function lookupAccountLinkMethods(email: string): Promise<{
  methods: string[];
  offer: "google" | "email" | "apple" | "phone" | null;
}> {
  const res = await fetch("/api/auth/account-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email }),
  });
  const json = await res.json().catch(() => ({}));
  const methods = Array.isArray(json?.data?.methods) ? json.data.methods : [];
  const offer = json?.data?.offer ?? null;
  return { methods, offer };
}
