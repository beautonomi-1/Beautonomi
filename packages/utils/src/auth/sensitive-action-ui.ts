/**
 * Shared UI rules for password vs OTP verification on sensitive account actions
 * (deactivate, delete, set password). Keep in sync with `/api/me/profile` auth_security.
 */
export type AuthSecuritySnapshot = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
};

export type ReauthOtpChannel = "email" | "sms" | "unavailable";

export type ReauthOtpDestination = {
  channel: ReauthOtpChannel;
  maskedDestination: string | null;
  /** Shown after `reauthenticate()` succeeds (toast / alert). */
  codeSentMessage: string;
  /** Inline hint before the user taps Send code. */
  sendButtonHint: string;
};

export function isAuthSecurityLoaded(
  authSecurity: AuthSecuritySnapshot | null | undefined,
): boolean {
  return authSecurity != null;
}

/** True only when the account has a Supabase password credential (not OTP-only). */
export function userHasPassword(authSecurity: AuthSecuritySnapshot | null | undefined): boolean {
  return authSecurity?.has_password === true;
}

/** Passwordless accounts can confirm via reauthenticate OTP when email or phone exists. */
export function canVerifySensitiveActionWithCode(
  authSecurity: AuthSecuritySnapshot | null | undefined,
): boolean {
  if (!authSecurity) return false;
  return Boolean(authSecurity.has_mailable_email || authSecurity.has_phone);
}

export function sensitiveActionSubmitReady(
  authSecurity: AuthSecuritySnapshot | null | undefined,
  input: { password: string; verificationNonce: string },
): boolean {
  if (!isAuthSecurityLoaded(authSecurity)) return false;
  if (userHasPassword(authSecurity)) {
    return input.password.trim().length > 0;
  }
  return input.verificationNonce.trim().length > 0;
}

/** Mask email for display in verification copy (e.g. j****@example.com). */
export function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim();
  const parts = trimmed.split("@");
  if (parts.length < 2 || !parts[0]) return trimmed;
  return `${parts[0].substring(0, 1)}****@${parts[1]}`;
}

/** Mask phone for display in verification copy (e.g. 271 *** ***1234). */
export function maskPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `${digits.substring(0, 3)} *** ***${digits.substring(digits.length - 4)}`;
  }
  return phone.trim();
}

/**
 * Describes where Supabase `reauthenticate()` will deliver the OTP.
 * Email is preferred when `has_mailable_email`; otherwise confirmed phone (SMS).
 */
export function describeReauthOtpDestination(
  authSecurity: AuthSecuritySnapshot | null | undefined,
  contact: { email?: string | null; phone?: string | null },
): ReauthOtpDestination {
  if (!canVerifySensitiveActionWithCode(authSecurity)) {
    return {
      channel: "unavailable",
      maskedDestination: null,
      codeSentMessage: "Add and verify an email or phone number before continuing.",
      sendButtonHint: "Add email or phone in Login & security first",
    };
  }

  if (authSecurity?.has_mailable_email) {
    const raw = contact.email?.trim();
    const masked = raw ? maskEmailForDisplay(raw) : null;
    return {
      channel: "email",
      maskedDestination: masked,
      codeSentMessage: masked
        ? `A verification code was sent to ${masked}. Enter it below to continue.`
        : "A verification code was sent to the email on your account. Enter it below to continue.",
      sendButtonHint: masked
        ? `We will send a code to ${masked}`
        : "We will send a code to the email on your account",
    };
  }

  const rawPhone = contact.phone?.trim();
  const maskedPhone = rawPhone ? maskPhoneForDisplay(rawPhone) : null;
  return {
    channel: "sms",
    maskedDestination: maskedPhone,
    codeSentMessage: maskedPhone
      ? `A verification code was sent by SMS to ${maskedPhone}. Enter it below to continue.`
      : "A verification code was sent to the phone number on your account. Enter it below to continue.",
    sendButtonHint: maskedPhone
      ? `We will send a code by SMS to ${maskedPhone}`
      : "We will send a code by SMS to the phone number on your account",
  };
}
