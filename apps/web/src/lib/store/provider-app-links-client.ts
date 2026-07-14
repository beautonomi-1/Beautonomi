import { NATIVE_STORE } from "@/lib/store/native-app-store";

export interface ProviderAppPlatformConfig {
  enabled?: boolean;
  app_store_url?: string;
  download_url?: string;
  app_gallery_url?: string;
}

export type ProviderAppsConfig = {
  ios?: ProviderAppPlatformConfig;
  android?: ProviderAppPlatformConfig;
  huawei?: ProviderAppPlatformConfig;
};

export const PROVIDER_APPS_FALLBACK: ProviderAppsConfig = {
  ios: { app_store_url: NATIVE_STORE.provider.defaultAppStoreUrl, enabled: true },
  android: { download_url: NATIVE_STORE.provider.defaultPlayStoreUrl, enabled: true },
  huawei: {
    app_gallery_url: "https://appgallery.huawei.com/app/C100000001",
    enabled: true,
  },
};

export function resolveProviderPlatformUrl(
  platform: ProviderAppPlatformConfig | undefined,
  kind: "ios" | "android" | "huawei",
): string | null {
  if (!platform || platform.enabled === false) return null;
  if (kind === "ios") {
    return platform.app_store_url ?? PROVIDER_APPS_FALLBACK.ios?.app_store_url ?? null;
  }
  if (kind === "android") {
    return platform.download_url ?? PROVIDER_APPS_FALLBACK.android?.download_url ?? null;
  }
  return platform.app_gallery_url ?? PROVIDER_APPS_FALLBACK.huawei?.app_gallery_url ?? null;
}

/** Primary scan target for desktop QR codes — mirrors invite SMS (Android first). */
export function getProviderAppQrTargetUrl(apps: ProviderAppsConfig, origin?: string): string {
  const android = resolveProviderPlatformUrl(apps.android, "android");
  const ios = resolveProviderPlatformUrl(apps.ios, "ios");
  const huawei = resolveProviderPlatformUrl(apps.huawei, "huawei");
  if (android) return android;
  if (ios) return ios;
  if (huawei) return huawei;
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/become-a-partner#app-demo`;
}

export function providerAppsHasAnyLink(apps: ProviderAppsConfig): boolean {
  return Boolean(
    resolveProviderPlatformUrl(apps.ios, "ios") ||
      resolveProviderPlatformUrl(apps.android, "android") ||
      resolveProviderPlatformUrl(apps.huawei, "huawei"),
  );
}
