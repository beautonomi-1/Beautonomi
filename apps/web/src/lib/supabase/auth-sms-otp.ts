/**
 * Supabase Auth OTP (6-digit) — SMS, `phone_change`, and **email** OTP (`verifyOtp` with `type: 'email'`).
 *
 * @see https://supabase.com/docs/guides/auth/phone-login — SMS / phone_change pin
 * @see https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp — email OTP
 * @see https://supabase.com/docs/reference/javascript/auth-verifyotp
 *
 * **Email: magic link vs numeric code (hosted Supabase)**  
 * `signInWithOtp({ email })` does **not** choose OTP vs link in the client alone. The **Magic Link** email template
 * must include `{{ .Token }}` (and should not rely only on `{{ .ConfirmationURL }}`) so users receive a
 * numeric code. Match **Authentication → Email → Magic Link** template and **Email OTP expiration** in the
 * Supabase dashboard to `platform_settings.settings.auth` (exposed via the public config bundle). See
 * `supabase/email-templates/README.md` in this repo.
 *
 * Token must be digits only (no spaces). Phone/email must match what was passed to `signInWithOtp` / `updateUser`.
 * Unified login/signup surfaces use `shouldCreateUser: true` so verifying an OTP can create an account.
 * Use `shouldCreateUser: false` only when you must block new registrations on that screen.
 */

export const SUPABASE_AUTH_OTP_LENGTH = 6;

/** Alias: same length as SMS and phone_change OTP in hosted Supabase Auth. */
export const SUPABASE_AUTH_SMS_OTP_LENGTH = SUPABASE_AUTH_OTP_LENGTH;

/**
 * Default SMS / phone_change OTP lifetime on hosted Supabase (seconds).
 * Your project’s Auth “OTP expiry” setting can differ; align resend UI with the dashboard.
 */
export const SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS = 120;

/**
 * Email OTP / magic code lifetime — matches Supabase Auth “Email OTP expiration” (seconds).
 * Use for user-facing “code valid for…” copy on email sign-in, not for SMS/phone.
 */
export const SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS = 3600;

/**
 * Minimum seconds between “Resend email code” taps in the UI (distinct from **code validity**, which is
 * `email_otp_expiration_seconds` in platform auth settings / Supabase “Email OTP expiration”).
 * Supabase commonly rate-limits repeat sends (~60s); using 60 avoids confusing errors right after send.
 */
export const SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Same idea for SMS — shorter window is usually acceptable for phone. */
export const SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Strip non-digits from the user-entered code before `verifyOtp`. */
export function normalizeSupabaseSmsOtpToken(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isCompleteSupabaseSmsOtp(raw: string): boolean {
  return normalizeSupabaseSmsOtpToken(raw).length === SUPABASE_AUTH_OTP_LENGTH;
}

/** Use with platform `settings.auth.email_otp_length` for email OTP (SMS stays on {@link isCompleteSupabaseSmsOtp}). */
export function isCompleteOtpForLength(raw: string, length: number): boolean {
  return length > 0 && normalizeSupabaseSmsOtpToken(raw).length === length;
}

/** Match formatting only — keep leading + and country/national digits. */
export function normalizeSupabaseAuthPhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, "").trim();
}
