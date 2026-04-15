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
  const db = await loadOneSignalFromDb(null);
  return db.restKeyCustomer || db.restKeyProvider || null;
}

export async function getOneSignalRestApiKeyForApp(
  appType: OneSignalAppType
): Promise<string | null> {
  const fromEnv = getOneSignalConfig(appType).restApiKey?.trim();
  if (fromEnv) return fromEnv;
  const db = await loadOneSignalFromDb(null);
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

function parseOneSignalRows(
  settingsRow: { settings?: { onesignal?: Record<string, unknown> } } | null,
  secretRow: {
    onesignal_rest_api_key?: string | null;
    onesignal_rest_api_key_provider?: string | null;
  } | null
): GlobalOneSignalDb {
  const os = settingsRow?.settings?.onesignal as
    | {
        app_id?: string;
        app_id_provider?: string;
      }
    | undefined;
  const appIdCustomer = (os?.app_id && String(os.app_id).trim()) || null;
  const appIdProvider = (os?.app_id_provider && String(os.app_id_provider).trim()) || null;
  const restKeyCustomer = secretRow?.onesignal_rest_api_key?.trim() || null;
  const restKeyProvider = secretRow?.onesignal_rest_api_key_provider?.trim() || null;
  return { appIdCustomer, appIdProvider, restKeyCustomer, restKeyProvider };
}

/**
 * Load OneSignal app IDs + REST keys from platform_settings / platform_secrets.
 * When `tenantId` is set, merges tenant row over global (`tenant_id IS NULL`) so market-scoped
 * Superadmin settings apply to broadcast and notifications (same as GET /api/admin/settings).
 */
async function loadOneSignalFromDb(tenantId?: string | null): Promise<GlobalOneSignalDb> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();

    const loadScope = async (tid: string | null): Promise<GlobalOneSignalDb> => {
      const settingsBase = admin
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1);
      const settingsQ = tid ? settingsBase.eq("tenant_id", tid) : settingsBase.is("tenant_id", null);

      const secretsBase = admin
        .from("platform_secrets")
        .select("onesignal_rest_api_key, onesignal_rest_api_key_provider")
        .order("updated_at", { ascending: false })
        .limit(1);
      const secretsQ = tid ? secretsBase.eq("tenant_id", tid) : secretsBase.is("tenant_id", null);

      const [{ data: settingsRow }, { data: secretRow }] = await Promise.all([
        settingsQ.maybeSingle(),
        secretsQ.maybeSingle(),
      ]);

      return parseOneSignalRows(
        settingsRow as { settings?: { onesignal?: Record<string, unknown> } } | null,
        secretRow as {
          onesignal_rest_api_key?: string | null;
          onesignal_rest_api_key_provider?: string | null;
        } | null
      );
    };

    const global = await loadScope(null);
    const tid = typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
    if (!tid) return global;

    const tenant = await loadScope(tid);
    return {
      appIdCustomer: tenant.appIdCustomer || global.appIdCustomer,
      appIdProvider: tenant.appIdProvider || global.appIdProvider,
      restKeyCustomer: tenant.restKeyCustomer || global.restKeyCustomer,
      restKeyProvider: tenant.restKeyProvider || global.restKeyProvider,
    };
  } catch {
    return {
      appIdCustomer: null,
      appIdProvider: null,
      restKeyCustomer: null,
      restKeyProvider: null,
    };
  }
}

export type ResolveOneSignalOptions = { tenantId?: string | null };

/**
 * Resolve App ID + REST key: env first, then platform_settings + platform_secrets (tenant row merged over global).
 */
export async function resolveOneSignalCredentials(
  appType?: OneSignalAppType,
  options?: ResolveOneSignalOptions
): Promise<{ appId: string | null; restKey: string | null }> {
  const db = await loadOneSignalFromDb(options?.tenantId);

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
  const appId = legacyId || customer.appId?.trim() || db.appIdCustomer || null;
  const restKey =
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
