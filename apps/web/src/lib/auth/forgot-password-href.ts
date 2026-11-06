import { sanitizeRelativeRedirect } from "@/lib/auth/post-login-return-path";

const EMAIL_FOR_FORGOT_PASSWORD =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidForgotPasswordEmail(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed !== "" && EMAIL_FOR_FORGOT_PASSWORD.test(trimmed);
}

export type BuildForgotPasswordHrefOptions = {
  email?: string | null;
  next?: string | null;
  /** The reset email was already sent: open on the code step. Ignored without a valid email. */
  codeSent?: boolean;
};

/** Relative path for /forgot-password with optional email, next, and sent query params. */
export function buildForgotPasswordHref(options: BuildForgotPasswordHrefOptions = {}): string {
  const params = new URLSearchParams();
  const hasEmail = isValidForgotPasswordEmail(options.email);
  if (hasEmail) {
    params.set("email", options.email!.trim());
  }
  const safeNext = sanitizeRelativeRedirect(options.next);
  if (safeNext) {
    params.set("next", safeNext);
  }
  if (hasEmail && options.codeSent) {
    params.set("sent", "1");
  }
  const qs = params.toString();
  return qs ? `/forgot-password?${qs}` : "/forgot-password";
}

const FORGOT_PASSWORD_NEXT_EXCLUDED_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

/** Resolve return path for forgot-password from modal context (redirectUrl or current location). */
export function resolveForgotPasswordNextFromModal(options: {
  redirectUrl?: string | null;
  pathname: string;
  search: string;
}): string | null {
  const fromRedirect = sanitizeRelativeRedirect(options.redirectUrl);
  if (fromRedirect) return fromRedirect;

  const path = options.pathname || "/";
  if (FORGOT_PASSWORD_NEXT_EXCLUDED_PATHS.has(path)) {
    return null;
  }
  const combined = options.search ? `${path}${options.search.startsWith("?") ? options.search : `?${options.search}`}` : path;
  return sanitizeRelativeRedirect(combined);
}
