/**
 * Shared UI rules for password vs OTP verification on sensitive account actions
 * (deactivate, delete, set password). Keep in sync with `/api/me/profile` auth_security.
 */
export type AuthSecuritySnapshot = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
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
