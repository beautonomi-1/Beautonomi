import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function hashDeviceKey(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code.replace(/\D/g, ""), "utf8").digest("hex");
}

export function generateDeviceKeyPlain(): string {
  return randomBytes(32).toString("base64url");
}

export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return String(n).padStart(digits, "0");
}

export async function rpcProviderSessionSecurity(
  userId: string,
  sessionId: string,
): Promise<{
  has_verified_totp: boolean;
  session_verified: boolean;
  device_limited_until: string | null;
  step_up_grant_expires_at: string | null;
  is_impersonation: boolean;
}> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("get_provider_session_security", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error) {
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    has_verified_totp: Boolean(row?.has_verified_totp),
    session_verified: Boolean(row?.session_verified),
    device_limited_until: row?.device_limited_until ?? null,
    step_up_grant_expires_at: row?.step_up_grant_expires_at ?? null,
    is_impersonation: Boolean(row?.is_impersonation),
  };
}

export async function syncUserSecurityStateFromFactors(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return;
  const factors = data?.factors ?? [];
  const totp = factors.filter(
    (f: { factor_type?: string; status?: string }) =>
      f.factor_type === "totp" && f.status === "verified",
  );
  await admin.from("user_security_state").upsert(
    {
      user_id: userId,
      has_verified_totp: totp.length > 0,
      totp_factor_count: totp.length,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc("revoke_all_user_sessions", { uid: userId });
  if (error) throw error;
}

export async function revokeTrustedDevicesExcept(
  admin: SupabaseClient,
  userId: string,
  exceptDeviceKeyHash?: string | null,
): Promise<void> {
  let q = admin
    .from("user_trusted_devices")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "security_event" })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (exceptDeviceKeyHash) {
    q = q.neq("device_key_hash", exceptDeviceKeyHash);
  }
  await q;
}
