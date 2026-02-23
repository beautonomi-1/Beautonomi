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
