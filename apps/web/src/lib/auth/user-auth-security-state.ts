import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolvePublicAuthPolicyForTenant } from "@/lib/config/resolve-public-auth-policy";
import type { PublicAuthPolicy } from "@/lib/config/auth-policy-public";

export type UserAuthSecurityState = {
  has_password: boolean;
  has_mailable_email: boolean;
  has_phone: boolean;
  email_is_placeholder: boolean;
  password_changed_at: string | null;
  policy: PublicAuthPolicy;
};

function isPlaceholderPhoneEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase().endsWith("@phone.local"));
}

async function readAuthUserHasPassword(userId: string): Promise<boolean | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as unknown as SupabaseClient)
      .schema("auth")
      .from("users")
      .select("encrypted_password")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[auth-security-state] failed to read auth.users password state:", error.message);
      return null;
    }

    const encryptedPassword = (data as { encrypted_password?: unknown } | null)?.encrypted_password;
    return typeof encryptedPassword === "string" && encryptedPassword.length > 0;
  } catch (error) {
    console.warn("[auth-security-state] failed to resolve password state:", error);
    return null;
  }
}

export async function getUserAuthSecurityState(
  supabase: SupabaseClient,
  authUser: User,
  userRow: {
    preferred_home_tenant_id?: string | null;
    password_changed_at?: string | null;
  } | null,
): Promise<UserAuthSecurityState> {
  const email = authUser.email?.trim() ?? "";
  const phone = authUser.phone?.trim() ?? "";
  const emailIsPlaceholder = isPlaceholderPhoneEmail(email);
  const policy = await resolvePublicAuthPolicyForTenant(userRow?.preferred_home_tenant_id ?? null);
  const hasPasswordFromAuth = await readAuthUserHasPassword(authUser.id);

  return {
    // If direct auth schema access is unavailable, keep existing password users working by
    // treating a recorded app password change as a positive signal.
    has_password: hasPasswordFromAuth ?? Boolean(userRow?.password_changed_at),
    has_mailable_email: Boolean(email && !emailIsPlaceholder),
    has_phone: Boolean(phone),
    email_is_placeholder: emailIsPlaceholder,
    password_changed_at: userRow?.password_changed_at ?? null,
    policy,
  };
}
