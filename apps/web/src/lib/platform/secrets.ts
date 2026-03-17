/**
 * Server-only platform secrets from process.env.
 * Do not import in client bundles.
 */

export function requireServerEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export type OneSignalAppType = "customer" | "provider";

/** OneSignal config for a specific app (customer or provider). Falls back to legacy single-app env when per-app vars unset. */
export function getOneSignalConfig(appType: OneSignalAppType): {
  appId: string | null;
  restApiKey: string | null;
} {
  const legacyAppId = process.env.ONESIGNAL_APP_ID ?? null;
  const legacyKey = process.env.ONESIGNAL_REST_API_KEY ?? null;
  if (appType === "provider") {
    return {
      appId: process.env.ONESIGNAL_APP_ID_PROVIDER ?? legacyAppId,
      restApiKey: process.env.ONESIGNAL_REST_API_KEY_PROVIDER ?? legacyKey,
    };
  }
  return {
    appId: process.env.ONESIGNAL_APP_ID_CUSTOMER ?? legacyAppId,
    restApiKey: process.env.ONESIGNAL_REST_API_KEY_CUSTOMER ?? legacyKey,
  };
}

export function getOneSignalSecret(): { apiKey?: string; appId?: string } {
  return {
    apiKey: process.env.ONESIGNAL_REST_API_KEY ?? undefined,
    appId: process.env.ONESIGNAL_APP_ID ?? undefined,
  };
}

export function getMapboxSecrets(): { token?: string } {
  return {
    token: process.env.MAPBOX_ACCESS_TOKEN ?? undefined,
  };
}

export function getPaystackSecrets(): {
  secretKey?: string;
  publicKey?: string;
} {
  return {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? undefined,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? undefined,
  };
}

export async function getOneSignalRestApiKey(): Promise<string | null> {
  return process.env.ONESIGNAL_REST_API_KEY ?? null;
}

export async function getOneSignalRestApiKeyForApp(
  appType: OneSignalAppType
): Promise<string | null> {
  return getOneSignalConfig(appType).restApiKey;
}

export async function getMapboxAccessToken(): Promise<string | null> {
  const fromEnv = process.env.MAPBOX_ACCESS_TOKEN ?? null;
  if (fromEnv) return fromEnv;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();
    const { data } = await (admin.from("platform_secrets") as any)
      .select("mapbox_access_token")
      .limit(1)
      .maybeSingle();
    return (data?.mapbox_access_token as string) || null;
  } catch {
    return null;
  }
}
