import type { SupabaseClient, User } from "@supabase/supabase-js";
import { verifyCurrentPasswordForUser } from "@/lib/auth/verify-current-password";

export async function verifySensitiveActionForUser(
  supabase: SupabaseClient,
  authUser: User,
  input: { password?: string | null; nonce?: string | null },
): Promise<boolean> {
  const password = input.password?.trim();
  if (password) {
    return verifyCurrentPasswordForUser(supabase, authUser, password);
  }

  const nonce = input.nonce?.trim();
  if (!nonce) return false;

  // Pass only the nonce to GoTrue — it verifies reauthentication without
  // mutating any user data. Writing extra `data` fields would pollute app_metadata.
  const { error } = await supabase.auth.updateUser({
    nonce,
  } as Parameters<typeof supabase.auth.updateUser>[0]);

  return !error;
}
