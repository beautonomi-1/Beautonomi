import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";

/** Refresh cookie present but revoked/expired in Supabase — treat as signed out. */
export function isStaleRefreshTokenError(error: AuthError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "refresh_token_not_found" || error.code === "invalid_refresh_token") {
    return true;
  }
  const msg = error.message?.toLowerCase() ?? "";
  return msg.includes("refresh token") && (msg.includes("not found") || msg.includes("invalid"));
}

/**
 * Server-side `getUser()` that clears stale auth cookies instead of surfacing AuthApiError noise.
 * Returns `null` when unauthenticated or when refresh tokens are invalid.
 */
export async function getServerUserSafe(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error) return user;

  if (isStaleRefreshTokenError(error)) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Cookie cleanup best-effort only.
    }
    return null;
  }

  return null;
}
