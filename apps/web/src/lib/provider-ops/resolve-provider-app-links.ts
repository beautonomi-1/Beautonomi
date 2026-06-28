import type { SupabaseClient } from "@supabase/supabase-js";
import { NATIVE_STORE } from "@/lib/store/native-app-store";

export interface ProviderAppLinks {
  ios: string | null;
  android: string | null;
  huawei: string | null;
}

interface PlatformAppPlatform {
  enabled?: boolean;
  app_store_url?: string | null;
  download_url?: string | null;
  app_gallery_url?: string | null;
}

interface PlatformProviderApps {
  ios?: PlatformAppPlatform;
  android?: PlatformAppPlatform;
  huawei?: PlatformAppPlatform;
}

/**
 * Resolve the provider native-app store links.
 *
 * Mirrors `GET /api/public/apps?type=provider`: prefer the tenant's
 * `platform_settings.settings.apps.provider` overrides, then the global row,
 * then the canonical `NATIVE_STORE.provider` defaults. A platform with
 * `enabled: false` is treated as unavailable (null).
 */
export async function resolveProviderAppLinks(
  supabase: SupabaseClient,
  tenantId?: string | null,
): Promise<ProviderAppLinks> {
  const fallback: ProviderAppLinks = {
    ios: NATIVE_STORE.provider.defaultAppStoreUrl,
    android: NATIVE_STORE.provider.defaultPlayStoreUrl,
    huawei: null,
  };

  const readProviderApps = async (
    scopeTenantId: string | null,
  ): Promise<PlatformProviderApps | null> => {
    let query = supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    query = scopeTenantId == null ? query.is("tenant_id", null) : query.eq("tenant_id", scopeTenantId);
    const { data } = await query.maybeSingle();
    const apps = (data?.settings as { apps?: { provider?: PlatformProviderApps } } | undefined)?.apps;
    return apps?.provider ?? null;
  };

  try {
    const providerApps =
      (tenantId ? await readProviderApps(tenantId) : null) ?? (await readProviderApps(null));

    if (providerApps && typeof providerApps === "object") {
      const { ios, android, huawei } = providerApps;
      return {
        ios:
          ios?.enabled === false
            ? null
            : (ios?.app_store_url?.trim() || fallback.ios),
        android:
          android?.enabled === false
            ? null
            : (android?.download_url?.trim() || fallback.android),
        huawei:
          huawei && huawei.enabled !== false && huawei.app_gallery_url?.trim()
            ? huawei.app_gallery_url.trim()
            : null,
      };
    }
  } catch {
    // platform_settings may be unavailable in dev — fall through to defaults.
  }

  return fallback;
}
