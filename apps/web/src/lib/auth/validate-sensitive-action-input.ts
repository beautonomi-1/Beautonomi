import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getUserAuthSecurityState, type UserAuthSecurityState } from "@/lib/auth/user-auth-security-state";

export function parseSensitiveActionCredentials(body: unknown): {
  password: string;
  verificationNonce: string;
} {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    password: typeof record.password === "string" ? record.password.trim() : "",
    verificationNonce:
      typeof record.verificationNonce === "string"
        ? record.verificationNonce.trim()
        : typeof record.verification_nonce === "string"
          ? record.verification_nonce.trim()
          : "",
  };
}

export async function resolveAuthSecurityForUser(
  supabase: SupabaseClient,
  authUser: User,
): Promise<UserAuthSecurityState> {
  const { data: userRow } = await supabase
    .from("users")
    .select("preferred_home_tenant_id, password_changed_at")
    .eq("id", authUser.id)
    .maybeSingle();

  return getUserAuthSecurityState(supabase, authUser, {
    preferred_home_tenant_id:
      (userRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ?? null,
    password_changed_at:
      (userRow as { password_changed_at?: string | null } | null)?.password_changed_at ?? null,
  });
}

export function validateSensitiveActionCredentials(
  authSecurity: UserAuthSecurityState,
  creds: { password: string; verificationNonce: string },
  actionLabel: string,
): { ok: true } | { ok: false; message: string; status: number } {
  if (!creds.password && !creds.verificationNonce) {
    return {
      ok: false,
      status: 400,
      message: `Password or verification code is required to ${actionLabel}`,
    };
  }

  if (!authSecurity.has_password && creds.password && !creds.verificationNonce) {
    return {
      ok: false,
      status: 400,
      message:
        "This account signs in with email or phone codes and does not have a password. Request a verification code and enter it to continue.",
    };
  }

  if (
    !authSecurity.has_password &&
    creds.verificationNonce &&
    !authSecurity.has_mailable_email &&
    !authSecurity.has_phone
  ) {
    return {
      ok: false,
      status: 400,
      message: "Add and verify an email or phone number before continuing.",
    };
  }

  return { ok: true };
}
