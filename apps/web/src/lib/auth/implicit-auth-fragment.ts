/**
 * Supabase implicit-flow redirects (used by the native apps' Supabase clients, e.g.
 * `resetPasswordForEmail` from the customer / provider apps) deliver the session in the URL
 * fragment: `#access_token=…&refresh_token=…&type=recovery`, or `#error=…&error_description=…`.
 */

export const RESET_PASSWORD_PATH = "/account-settings/login-and-security/reset-password";

export type ImplicitAuthFragment =
  | { kind: "session"; accessToken: string; refreshToken: string; type: string | null }
  | { kind: "error"; message: string }
  | { kind: "none" };

export function parseImplicitAuthFragment(hash: string | null | undefined): ImplicitAuthFragment {
  const raw = (hash ?? "").replace(/^#/, "");
  if (!raw) return { kind: "none" };
  const params = new URLSearchParams(raw);

  const errorMessage = params.get("error_description") || params.get("error");
  if (errorMessage) return { kind: "error", message: errorMessage };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "session", accessToken, refreshToken, type: params.get("type") };
  }
  return { kind: "none" };
}

function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

/** Where to send the browser once the fragment session has been stored. */
export function resolveImplicitAuthDestination(type: string | null, next: string | null): string {
  const safeNext = safeInternalPath(next);
  if (type === "recovery") {
    return safeNext
      ? `${RESET_PASSWORD_PATH}?next=${encodeURIComponent(safeNext)}`
      : RESET_PASSWORD_PATH;
  }
  // /portal resolves role + customer onboarding gate server-side.
  return safeNext ?? "/portal";
}

export function buildAuthErrorLoginPath(message: string, next: string | null): string {
  const params = new URLSearchParams({ error: message });
  const safeNext = safeInternalPath(next);
  if (safeNext) params.set("next", safeNext);
  return `/login?${params.toString()}`;
}
