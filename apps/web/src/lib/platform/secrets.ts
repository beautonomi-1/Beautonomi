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
  const fromEnv = process.env.ONESIGNAL_REST_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const db = await loadGlobalOneSignalFromDb();
  return db.restKeyCustomer || db.restKeyProvider || null;
}

export async function getOneSignalRestApiKeyForApp(
  appType: OneSignalAppType
): Promise<string | null> {
  const fromEnv = getOneSignalConfig(appType).restApiKey?.trim();
  if (fromEnv) return fromEnv;
  const db = await loadGlobalOneSignalFromDb();
  if (appType === "provider") {
    return db.restKeyProvider || db.restKeyCustomer || null;
  }
  return db.restKeyCustomer || db.restKeyProvider || null;
}

type GlobalOneSignalDb = {
  appIdCustomer: string | null;
  appIdProvider: string | null;
  restKeyCustomer: string | null;
  restKeyProvider: string | null;
};

async function loadGlobalOneSignalFromDb(): Promise<GlobalOneSignalDb> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();

    const [{ data: settingsRow }, { data: secretRow }] = await Promise.all([
      admin
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("platform_secrets")
        .select("onesignal_rest_api_key, onesignal_rest_api_key_provider")
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const os = (settingsRow as { settings?: { onesignal?: Record<string, unknown> } } | null)?.settings
      ?.onesignal as
      | {
          app_id?: string;
          app_id_provider?: string;
        }
      | undefined;

    const appIdCustomer = (os?.app_id && String(os.app_id).trim()) || null;
    const appIdProvider = (os?.app_id_provider && String(os.app_id_provider).trim()) || null;
    const sr = secretRow as {
      onesignal_rest_api_key?: string;
      onesignal_rest_api_key_provider?: string;
    } | null;
    const restKeyCustomer = sr?.onesignal_rest_api_key?.trim() || null;
    const restKeyProvider = sr?.onesignal_rest_api_key_provider?.trim() || null;

    return { appIdCustomer, appIdProvider, restKeyCustomer, restKeyProvider };
  } catch {
    return {
      appIdCustomer: null,
      appIdProvider: null,
      restKeyCustomer: null,
      restKeyProvider: null,
    };
  }
}

/**
 * Resolve App ID + REST key: env first, then global platform_settings + platform_secrets (superadmin).
 */
export async function resolveOneSignalCredentials(
  appType?: OneSignalAppType
): Promise<{ appId: string | null; restKey: string | null }> {
  const db = await loadGlobalOneSignalFromDb();

  if (appType === "provider") {
    const env = getOneSignalConfig("provider");
    let appId = env.appId?.trim() || null;
    let restKey = env.restApiKey?.trim() || null;
    if (!appId) {
      appId = db.appIdProvider || db.appIdCustomer;
    }
    if (!restKey) {
      restKey = db.restKeyProvider || db.restKeyCustomer;
    }
    return { appId, restKey };
  }

  if (appType === "customer") {
    const env = getOneSignalConfig("customer");
    let appId = env.appId?.trim() || null;
    let restKey = env.restApiKey?.trim() || null;
    if (!appId) {
      appId = db.appIdCustomer;
    }
    if (!restKey) {
      restKey = db.restKeyCustomer || db.restKeyProvider;
    }
    return { appId, restKey };
  }

  const legacyId = process.env.ONESIGNAL_APP_ID?.trim() || null;
  const legacyKey = process.env.ONESIGNAL_REST_API_KEY?.trim() || null;
  const customer = getOneSignalConfig("customer");
  let appId = legacyId || customer.appId?.trim() || db.appIdCustomer || null;
  let restKey =
    legacyKey || customer.restApiKey?.trim() || db.restKeyCustomer || db.restKeyProvider || null;
  return { appId, restKey };
}

/**
 * Token for server-side Mapbox APIs (Geocoding, Directions, etc.).
 * Order: MAPBOX_ACCESS_TOKEN → platform_secrets.mapbox_access_token → mapbox_config.public_access_token
 * → NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN (server can read this in Next.js for geocoding when DB is empty).
 */
export async function getMapboxAccessToken(): Promise<string | null> {
  const fromEnv = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();
    const { data } = await (admin.from("platform_secrets") as any)
      .select("mapbox_access_token")
      .limit(1)
      .maybeSingle();
    const secret = ((data?.mapbox_access_token as string) || "").trim();
    if (secret) return secret;

    const { data: cfg } = await admin
      .from("mapbox_config")
      .select("public_access_token")
      .limit(1)
      .maybeSingle();
    const pub = ((cfg as { public_access_token?: string } | null)?.public_access_token || "").trim();
    if (pub) return pub;

    const fromNextPublic = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
    return fromNextPublic || null;
  } catch {
    return null;
  }
}
