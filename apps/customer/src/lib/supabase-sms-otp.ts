/**
 * Supabase Auth OTP length: SMS, phone_change, and email OTP are all 6-digit in hosted Auth.
 * Login-only UIs should pass `shouldCreateUser: false` on `signInWithOtp` so OTP does not register new users.
 * @see https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp
 */
export const SUPABASE_AUTH_OTP_LENGTH = 6;
export const SUPABASE_AUTH_SMS_OTP_LENGTH = SUPABASE_AUTH_OTP_LENGTH;

/** Default hosted Supabase SMS / phone_change OTP lifetime (seconds); match Auth dashboard “OTP expiry”. */
export const SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS = 120;

/** Supabase “Email OTP expiration” (seconds) — for email code login copy only. */
export const SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS = 3600;

/** Minimum seconds between “Resend email code” taps (not the same as OTP validity). */
export const SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Minimum seconds between “Resend SMS” taps. */
export const SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS = 30;

export function normalizeSupabaseSmsOtpToken(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isCompleteSupabaseSmsOtp(raw: string): boolean {
  return normalizeSupabaseSmsOtpToken(raw).length === SUPABASE_AUTH_OTP_LENGTH;
}

export function isCompleteOtpForLength(raw: string, length: number): boolean {
  return length > 0 && normalizeSupabaseSmsOtpToken(raw).length === length;
}

export function normalizeSupabaseAuthPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, "").trim();
}
