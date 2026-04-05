/**
 * Supabase Auth OTP (6-digit) — SMS, `phone_change`, and **email** OTP (`verifyOtp` with `type: 'email'`).
 *
 * @see https://supabase.com/docs/guides/auth/phone-login — SMS / phone_change pin
 * @see https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp — email OTP
 * @see https://supabase.com/docs/reference/javascript/auth-verifyotp
 *
 * Token must be digits only (no spaces). Phone/email must match what was passed to `signInWithOtp` / `updateUser`.
 * For **login-only** surfaces, pass `shouldCreateUser: false` on `signInWithOtp` so OTP does not register new users.
 */

export const SUPABASE_AUTH_OTP_LENGTH = 6;

/** Alias: same length as SMS and phone_change OTP in hosted Supabase Auth. */
export const SUPABASE_AUTH_SMS_OTP_LENGTH = SUPABASE_AUTH_OTP_LENGTH;

/**
 * Default SMS / phone_change OTP lifetime on hosted Supabase (seconds).
 * Your project’s Auth “OTP expiry” setting can differ; align resend UI with the dashboard.
 */
export const SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS = 120;

/** Strip non-digits from the user-entered code before `verifyOtp`. */
export function normalizeSupabaseSmsOtpToken(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isCompleteSupabaseSmsOtp(raw: string): boolean {
  return normalizeSupabaseSmsOtpToken(raw).length === SUPABASE_AUTH_OTP_LENGTH;
}

/** Match formatting only — keep leading + and country/national digits. */
export function normalizeSupabaseAuthPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, "").trim();
}
