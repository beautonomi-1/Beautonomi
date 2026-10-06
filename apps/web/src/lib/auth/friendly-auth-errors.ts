export function friendlyAuthErrorMessage(
  raw: string,
  channel: "phone" | "email",
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("for security purposes") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("too many attempts")
  ) {
    return t("web.login.errors.tooManyAttempts");
  }
  if (lower.includes("invalid phone")) return t("web.login.errors.invalidPhone");
  if (lower.includes("invalid email")) return t("web.login.errors.invalidEmail");
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled")) {
    return channel === "phone"
      ? t("web.login.errors.phoneSignupDisabled")
      : t("web.login.errors.emailSignupDisabled");
  }
  if (lower.includes("user not found")) {
    return t("web.login.errors.userNotFound");
  }
  if (lower.includes("token has expired") || lower.includes("otp_expired")) {
    return t("web.login.errors.codeExpired");
  }
  if (lower.includes("invalid otp") || lower.includes("invalid token") || lower.includes("otp_invalid")) {
    return t("web.login.errors.codeInvalid");
  }
  return raw;
}
