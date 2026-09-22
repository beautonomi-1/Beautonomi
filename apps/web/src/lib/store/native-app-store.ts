/**
 * Canonical App Store / Play Store identifiers for Beautonomi native apps.
 *
 * **Must stay in sync** with:
 * - `apps/customer/app.json` → `ios.bundleIdentifier` / `android.package`
 * - `apps/provider/app.json` → same
 *
 * Production listings may use `platform_settings.apps` overrides; these values are
 * API fallbacks and admin defaults when nothing is configured.
 */
export const NATIVE_STORE = {
  customer: {
    bundleIdIos: "com.beautonomi",
    packageAndroid: "com.beautonomi",
    defaultAppStoreUrl: "https://apps.apple.com/za/app/beautonomi/id6748387058",
    defaultPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.beautonomi",
  },
  provider: {
    bundleIdIos: "com.beautonomi.partner",
    packageAndroid: "com.beautonomi.partner",
    defaultAppStoreUrl: "https://apps.apple.com/za/app/beautonomi-partner/id6748387936",
    defaultPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.beautonomi.partner",
  },
} as const;

/** Treat empty, whitespace-only, and `#` as missing so CMS blanks fall back to canonical URLs. */
export function coalesceStoreUrl(
  value: string | null | undefined,
  fallback: string,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "#") return fallback;
  return trimmed;
}

type AppPlatformBlock = {
  package_name?: string;
  bundle_id?: string;
  version?: string;
  min_version?: string;
  download_url?: string;
  app_store_url?: string;
  app_gallery_url?: string;
  enabled?: boolean;
};

type AppsPersona = {
  android?: AppPlatformBlock;
  ios?: AppPlatformBlock;
  huawei?: AppPlatformBlock;
};

export type PublicAppsPersonaAndroid = {
  package_name: string;
  version: string;
  min_version: string;
  download_url: string;
  enabled: boolean;
};

export type PublicAppsPersonaIos = {
  bundle_id: string;
  version: string;
  min_version: string;
  app_store_url: string;
  enabled: boolean;
};

export type PublicAppsPersonaHuawei = {
  package_name: string;
  version: string;
  min_version: string;
  app_gallery_url: string;
  enabled: boolean;
};

export type PublicAppsPersona = {
  android: PublicAppsPersonaAndroid;
  ios: PublicAppsPersonaIos;
  huawei: PublicAppsPersonaHuawei;
};

export type PublicAppsResponse = {
  customer: PublicAppsPersona;
  provider: PublicAppsPersona;
};

/** Deep-merge CMS `apps` with canonical defaults; coalesce store URLs on each platform. */
export function mergePublicAppsWithDefaults(
  cmsApps: Record<string, AppsPersona> | null | undefined,
): PublicAppsResponse {
  const defaults = getDefaultPublicAppsResponse();
  if (!cmsApps || typeof cmsApps !== "object") return defaults;

  const mergePersona = (
    persona: "customer" | "provider",
    cms: AppsPersona | undefined,
  ) => {
    const def = defaults[persona];
    const store = NATIVE_STORE[persona];
    const mergePlatform = (
      platform: "android" | "ios" | "huawei",
      cmsBlock: AppPlatformBlock | undefined,
      defBlock: AppPlatformBlock,
    ): AppPlatformBlock => {
      const merged = { ...defBlock, ...cmsBlock };
      if (platform === "ios") {
        merged.app_store_url = coalesceStoreUrl(
          cmsBlock?.app_store_url,
          store.defaultAppStoreUrl,
        );
        merged.bundle_id = coalesceStoreUrl(cmsBlock?.bundle_id, defBlock.bundle_id ?? store.bundleIdIos);
      } else if (platform === "android") {
        merged.download_url = coalesceStoreUrl(
          cmsBlock?.download_url,
          store.defaultPlayStoreUrl,
        );
        merged.package_name = coalesceStoreUrl(
          cmsBlock?.package_name,
          defBlock.package_name ?? store.packageAndroid,
        );
      } else {
        merged.app_gallery_url = coalesceStoreUrl(
          cmsBlock?.app_gallery_url,
          defBlock.app_gallery_url ?? "",
        );
      }
      return merged;
    };
    return {
      android: mergePlatform("android", cms?.android, def.android),
      ios: mergePlatform("ios", cms?.ios, def.ios),
      huawei: mergePlatform("huawei", cms?.huawei, def.huawei),
    };
  };

  return {
    customer: mergePersona("customer", cmsApps.customer) as PublicAppsPersona,
    provider: mergePersona("provider", cmsApps.provider) as PublicAppsPersona,
  };
}

/** Default payload shape for `GET /api/public/apps` when DB has no `apps` config. */
export function getDefaultPublicAppsResponse(): PublicAppsResponse {
  const c = NATIVE_STORE.customer;
  const p = NATIVE_STORE.provider;
  return {
    customer: {
      android: {
        package_name: c.packageAndroid,
        version: "1.0.0",
        min_version: "1.0.0",
        download_url: c.defaultPlayStoreUrl,
        enabled: true,
      },
      ios: {
        bundle_id: c.bundleIdIos,
        version: "1.0.0",
        min_version: "1.0.0",
        app_store_url: c.defaultAppStoreUrl,
        enabled: true,
      },
      huawei: {
        package_name: c.packageAndroid,
        version: "1.0.0",
        min_version: "1.0.0",
        app_gallery_url: "https://appgallery.huawei.com/app/C100000000",
        enabled: true,
      },
    },
    provider: {
      android: {
        package_name: p.packageAndroid,
        version: "1.0.0",
        min_version: "1.0.0",
        download_url: p.defaultPlayStoreUrl,
        enabled: true,
      },
      ios: {
        bundle_id: p.bundleIdIos,
        version: "1.0.0",
        min_version: "1.0.0",
        app_store_url: p.defaultAppStoreUrl,
        enabled: true,
      },
      huawei: {
        package_name: p.packageAndroid,
        version: "1.0.0",
        min_version: "1.0.0",
        app_gallery_url: "https://appgallery.huawei.com/app/C100000001",
        enabled: true,
      },
    },
  };
}
