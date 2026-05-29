import type { User as AuthUser } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type AuthMetadataSlice = Pick<
  AuthUser,
  "last_sign_in_at" | "email_confirmed_at" | "phone_confirmed_at"
>;

/**
 * Mirror Supabase Auth sign-in and confirmation flags into public.users so
 * admin lists and profile APIs stay accurate without a database auth trigger.
 */
export async function syncUserAuthMetadataToPublicProfile(
  admin: SupabaseClient,
  userId: string,
  authUser: AuthMetadataSlice | null | undefined,
): Promise<void> {
  if (!authUser) return;

  const lastSignIn = authUser.last_sign_in_at ?? null;
  const emailVerified = Boolean(authUser.email_confirmed_at);
  const phoneVerified = Boolean(authUser.phone_confirmed_at);

  const { data: row } = await admin
    .from("users")
    .select("last_login_at, email_verified, phone_verified")
    .eq("id", userId)
    .maybeSingle();

  if (!row) return;

  const updates: Record<string, unknown> = {};
  const current = row as {
    last_login_at?: string | null;
    email_verified?: boolean | null;
    phone_verified?: boolean | null;
  };

  if (lastSignIn) {
    const nextMs = Date.parse(lastSignIn);
    const currentMs = current.last_login_at ? Date.parse(current.last_login_at) : NaN;
    if (Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs > currentMs)) {
      updates.last_login_at = lastSignIn;
    }
  }
  if (emailVerified && !current.email_verified) {
    updates.email_verified = true;
  }
  if (phoneVerified && !current.phone_verified) {
    updates.phone_verified = true;
  }

  if (Object.keys(updates).length === 0) return;

  updates.updated_at = new Date().toISOString();
  await admin.from("users").update(updates).eq("id", userId);
}
