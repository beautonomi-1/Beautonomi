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
    /** Web URL; prefer numeric `id` URL from App Store Connect when known (set in admin or env). */
    defaultAppStoreUrl: "https://apps.apple.com/app/beautonomi",
    defaultPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.beautonomi",
  },
  provider: {
    bundleIdIos: "com.beautonomi.partner",
    packageAndroid: "com.beautonomi.partner",
    defaultAppStoreUrl: "https://apps.apple.com/app/beautonomi-provider",
    defaultPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.beautonomi.partner",
  },
} as const;

/** Default payload shape for `GET /api/public/apps` when DB has no `apps` config. */
export function getDefaultPublicAppsResponse() {
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
