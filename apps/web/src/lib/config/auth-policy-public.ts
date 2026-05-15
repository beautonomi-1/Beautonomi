/**
 * Public-safe policy aligned with `platform_settings.settings.auth` and Supabase Auth (email + phone) dashboard.
 * Used in config bundle and in `/api/me/password` (min length, require current password when enabled in policy).
 */
export type PublicAuthPolicy = {
  email_provider_enabled: boolean;
  secure_email_change: boolean;
  secure_password_change: boolean;
  require_current_password: boolean;
  prevent_leaked_passwords: boolean;
  minimum_password_length: number;
  password_requirements: "none" | "letters_and_digits" | "lowercase_uppercase_number";
  email_otp_expiration_seconds: number;
  email_otp_length: number;
  /** Supabase → Phone: enable phone-based sign-in. */
  phone_provider_enabled: boolean;
  /**
   * Supabase → Phone: require phone confirmation before sign-in; informational for in-app help text.
   * (Enforced in Supabase, not in this app.)
   */
  phone_confirmations_enabled: boolean;
  /** Public hint for SMS backend (e.g. twilio). */
  sms_provider: "twilio";
  /** SMS OTP expiry in seconds; UI copy and timers — align with Supabase “SMS OTP Expiry”. */
  sms_otp_expiration_seconds: number;
  /** Digits in SMS code — align with Supabase “SMS OTP Length”. */
  sms_otp_length: number;
};

export const DEFAULT_PUBLIC_AUTH: PublicAuthPolicy = {
  email_provider_enabled: true,
  secure_email_change: true,
  secure_password_change: true,
  require_current_password: true,
  prevent_leaked_passwords: true,
  minimum_password_length: 8,
  password_requirements: "none",
  email_otp_expiration_seconds: 3600,
  email_otp_length: 6,
  phone_provider_enabled: true,
  phone_confirmations_enabled: true,
  sms_provider: "twilio",
  sms_otp_expiration_seconds: 120,
  sms_otp_length: 6,
};

const PRESETS: PublicAuthPolicy["password_requirements"][] = [
  "none",
  "letters_and_digits",
  "lowercase_uppercase_number",
];

function coerceOne(raw: unknown): Partial<PublicAuthPolicy> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const b = (k: string) => (typeof o[k] === "boolean" ? (o[k] as boolean) : undefined);
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : undefined);
  const pr = o.password_requirements;
  const prOk =
    typeof pr === "string" && (PRESETS as string[]).includes(pr)
      ? (pr as PublicAuthPolicy["password_requirements"])
      : undefined;
  const u: Partial<PublicAuthPolicy> = {};
  if (b("email_provider_enabled") !== undefined) u.email_provider_enabled = b("email_provider_enabled");
  if (b("secure_email_change") !== undefined) u.secure_email_change = b("secure_email_change");
  if (b("secure_password_change") !== undefined) u.secure_password_change = b("secure_password_change");
  if (b("require_current_password") !== undefined) u.require_current_password = b("require_current_password");
  if (b("prevent_leaked_passwords") !== undefined) u.prevent_leaked_passwords = b("prevent_leaked_passwords");
  if (n("minimum_password_length") !== undefined) u.minimum_password_length = n("minimum_password_length");
  if (prOk !== undefined) u.password_requirements = prOk;
  if (n("email_otp_expiration_seconds") !== undefined) u.email_otp_expiration_seconds = n("email_otp_expiration_seconds");
  if (n("email_otp_length") !== undefined) u.email_otp_length = n("email_otp_length");
  if (b("phone_provider_enabled") !== undefined) u.phone_provider_enabled = b("phone_provider_enabled");
  if (b("phone_confirmations_enabled") !== undefined) u.phone_confirmations_enabled = b("phone_confirmations_enabled");
  const smsp = o.sms_provider;
  if (typeof smsp === "string" && smsp === "twilio") (u as Partial<PublicAuthPolicy>).sms_provider = "twilio";
  if (n("sms_otp_expiration_seconds") !== undefined) u.sms_otp_expiration_seconds = n("sms_otp_expiration_seconds");
  if (n("sms_otp_length") !== undefined) u.sms_otp_length = n("sms_otp_length");
  return u;
}

/**
 * Fill missing keys; clamp basic ranges for client/server safety.
 */
export function finalizePublicAuth(
  a: PublicAuthPolicy | (Partial<PublicAuthPolicy> & { email_provider_enabled?: boolean })
): PublicAuthPolicy {
  const o = { ...DEFAULT_PUBLIC_AUTH, ...a } as PublicAuthPolicy;
  o.minimum_password_length = Math.min(128, Math.max(6, o.minimum_password_length));
  o.email_otp_length = Math.min(10, Math.max(4, o.email_otp_length));
  o.email_otp_expiration_seconds = Math.min(604800, Math.max(120, o.email_otp_expiration_seconds));
  o.sms_otp_length = Math.min(10, Math.max(4, o.sms_otp_length));
  o.sms_otp_expiration_seconds = Math.min(24 * 60 * 60, Math.max(30, o.sms_otp_expiration_seconds));
  if (o.sms_provider !== "twilio") o.sms_provider = "twilio";
  if (!PRESETS.includes(o.password_requirements)) o.password_requirements = "none";
  return o;
}

function pickAuthFromSettingsRow(settings: Record<string, unknown> | null | undefined): unknown {
  if (!settings || typeof settings !== "object") return undefined;
  return (settings as { auth?: unknown }).auth;
}

export function mergeAuthFromSettingsJson(
  globalSettings: Record<string, unknown> | null | undefined,
  tenantOverrideSettings: Record<string, unknown> | null | undefined
): PublicAuthPolicy {
  const g = coerceOne(pickAuthFromSettingsRow(globalSettings));
  const t = coerceOne(pickAuthFromSettingsRow(tenantOverrideSettings));
  return finalizePublicAuth({ ...DEFAULT_PUBLIC_AUTH, ...g, ...t });
}

const LETTERS = /[A-Za-z]/;
const LOWER = /[a-z]/;
const UPPER = /[A-Z]/;
const DIGIT = /[0-9]/;
const SYMBOL = /[^A-Za-z0-9]/;

/** Client/server guardrails aligned with `password_requirements` (approximate, not a full zxcvbn). */
export function passwordMeetsPolicyRequirements(
  password: string,
  mode: PublicAuthPolicy["password_requirements"]
): boolean {
  if (mode === "none") return true;
  if (mode === "letters_and_digits") {
    return LETTERS.test(password) && DIGIT.test(password);
  }
  return LOWER.test(password) && UPPER.test(password) && DIGIT.test(password);
}

