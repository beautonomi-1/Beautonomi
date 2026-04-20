import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Confirms the user's password for sensitive actions (change password, deactivate).
 * Tries email-based sign-in first for normal accounts, then phone for phone-primary signups.
 * Placeholder emails (`*@phone.local`) are tried after phone so phone-password users still work.
 */
export async function verifyCurrentPasswordForUser(
  supabase: SupabaseClient,
  authUser: User,
  password: string,
): Promise<boolean> {
  const email = authUser.email?.trim() ?? "";
  const phone = authUser.phone?.trim() ?? "";

  if (email && !email.endsWith("@phone.local")) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return true;
  }

  if (phone) {
    const { error } = await supabase.auth.signInWithPassword({ phone, password });
    if (!error) return true;
  }

  if (email && email.endsWith("@phone.local")) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return true;
  }

  return false;
}
