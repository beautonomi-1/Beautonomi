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

function authUserHasStoredPassword(encryptedPassword: unknown): boolean {
  return typeof encryptedPassword === "string" && encryptedPassword.length > 0;
}

async function readAuthUserHasPassword(userId: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as unknown as SupabaseClient)
      .schema("auth")
      .from("users")
      .select("encrypted_password")
      .eq("id", userId)
      .maybeSingle();

    if (!error) {
      return authUserHasStoredPassword(
        (data as { encrypted_password?: unknown } | null)?.encrypted_password,
      );
    }

    console.warn("[auth-security-state] auth.users query failed, trying admin API:", error.message);
  } catch (error) {
    console.warn("[auth-security-state] auth.users query threw, trying admin API:", error);
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) {
      console.warn("[auth-security-state] admin getUserById failed:", error?.message ?? "no user");
      return false;
    }

    const raw = data.user as { encrypted_password?: unknown };
    if (raw.encrypted_password !== undefined) {
      return authUserHasStoredPassword(raw.encrypted_password);
    }
  } catch (error) {
    console.warn("[auth-security-state] admin getUserById threw:", error);
  }

  // Default passwordless when we cannot read auth credential state — safer than blocking
  // OTP/magic-link users behind a password field they cannot satisfy.
  return false;
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
    // Only true when Supabase Auth stores a password hash (OTP/OAuth-only accounts stay false).
    has_password: hasPasswordFromAuth,
    has_mailable_email: Boolean(email && !emailIsPlaceholder),
    has_phone: Boolean(phone),
    email_is_placeholder: emailIsPlaceholder,
    password_changed_at: userRow?.password_changed_at ?? null,
    policy,
  };
}
