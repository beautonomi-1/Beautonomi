import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashDeviceKey } from "@/lib/auth/auth-security-db";
import {
  decodeJwtPayload,
  resolveRequestAccessToken,
} from "@/lib/supabase/api-helpers";
import { getProviderProtectionPolicy } from "@/lib/auth/provider-security";
import { clearProviderSecurityAllowedCache } from "@/lib/auth/provider-security";

export async function readDeviceKeyFromRequest(request: NextRequest | Request): Promise<string | null> {
  const header = request.headers.get("X-Device-Key");
  if (header?.trim()) return header.trim();
  try {
    const jar = await cookies();
    return jar.get("bn_device")?.value ?? null;
  } catch {
    return null;
  }
}

export async function readSessionIdFromRequest(request: NextRequest | Request): Promise<string | null> {
  const token = await resolveRequestAccessToken(request);
  const payload = token ? decodeJwtPayload(token) : null;
  return typeof payload?.session_id === "string" ? payload.session_id : null;
}

/** Short human label ("Chrome on Windows", "Beautonomi Provider app on iOS") for device lists and alerts. */
export function describeDevice(request: NextRequest | Request): { label: string; platform: string } {
  const explicit = request.headers.get("X-Device-Label")?.trim();
  const ua = request.headers.get("user-agent") ?? "";
  const os = /iPhone|iPad|iOS/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
      ? "Android"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  const isApp = request.headers.get("X-App") === "provider" || /Expo|okhttp|CFNetwork/i.test(ua);
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const label = explicit || (isApp ? `Beautonomi Provider app on ${os}` : `${browser} on ${os}`);
  return { label: label.slice(0, 80), platform: isApp ? "app" : "web" };
}

/**
 * Marks the current session verified and (when the request carries a device key) trusts that device.
 * Without a device key only the session is verified, so no unreachable device rows are created.
 */
export async function trustCurrentDevice(
  request: NextRequest | Request,
  userId: string,
  reason: string,
  options?: { limitedHours?: number },
): Promise<{ deviceId: string | null }> {
  const admin = getSupabaseAdmin();
  const plain = await readDeviceKeyFromRequest(request);
  let deviceId: string | null = null;

  if (plain) {
    const policy = await getProviderProtectionPolicy();
    const trustedUntil = new Date(Date.now() + policy.trusted_device_days * 86400 * 1000);
    const limitedUntil =
      options?.limitedHours && options.limitedHours > 0
        ? new Date(Date.now() + options.limitedHours * 3600 * 1000).toISOString()
        : null;
    const { label, platform } = describeDevice(request);

    const { data: device } = await admin
      .from("user_trusted_devices")
      .upsert(
        {
          user_id: userId,
          device_key_hash: hashDeviceKey(plain),
          app_type: "provider",
          label,
          platform,
          trusted_until: trustedUntil.toISOString(),
          limited_until: limitedUntil,
          last_seen_at: new Date().toISOString(),
          revoked_at: null,
          revoked_reason: null,
        },
        { onConflict: "user_id,device_key_hash" },
      )
      .select("id")
      .single();
    deviceId = (device as { id?: string } | null)?.id ?? null;
  }

  const sessionId = await readSessionIdFromRequest(request);
  if (sessionId) {
    await admin.from("auth_session_verifications").upsert(
      {
        session_id: sessionId,
        user_id: userId,
        device_id: deviceId,
        method: reason,
        verified_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    );
    clearProviderSecurityAllowedCache(sessionId, userId);
  }

  return { deviceId };
}
