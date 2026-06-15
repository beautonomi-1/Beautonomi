import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Confirms the user's password for sensitive actions (change password, deactivate, delete).
 * Tries email-based sign-in first for normal accounts, then phone for phone-primary signups.
 * Placeholder emails (`*@phone.local`) are tried after phone so phone-password users still work.
 *
 * IMPORTANT: the password check runs on a short-lived, ISOLATED Supabase client —
 * never the request-scoped client passed in. Calling `signInWithPassword` on the
 * caller's client re-authenticates and rotates its in-memory session mid-request,
 * which corrupts the session used for the subsequent privileged write on
 * bearer-token (mobile) requests. That manifested as a generic 500
 * ("Failed to deactivate account") for accounts that sign in with a password.
 */
export async function verifyCurrentPasswordForUser(
  _supabase: SupabaseClient,
  authUser: User,
  password: string,
): Promise<boolean> {
  const email = authUser.email?.trim() ?? "";
  const phone = authUser.phone?.trim() ?? "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || url.includes("placeholder") || !anonKey || anonKey.includes("placeholder")) {
    return false;
  }

  // Throwaway client: no session persistence, no auto-refresh, no URL parsing —
  // so verifying credentials here cannot mutate the caller's session.
  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const attempt = async (
    creds: { email: string; password: string } | { phone: string; password: string },
  ): Promise<boolean> => {
    const { error } = await verifier.auth.signInWithPassword(creds);
    return !error;
  };

  if (email && !email.endsWith("@phone.local")) {
    if (await attempt({ email, password })) return true;
  }

  if (phone) {
    if (await attempt({ phone, password })) return true;
  }

  if (email && email.endsWith("@phone.local")) {
    if (await attempt({ email, password })) return true;
  }

  return false;
}
