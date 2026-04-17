# Provider App – Expo & Production Notes

Optional follow-ups from the Provider Completeness and Expo Alignment audit. Address these when preparing production builds or deploying OTA updates.

## OneSignal

- **Current:** `app.json` plugins use `["onesignal-expo-plugin", { "mode": "development" }]` and iOS entitlements use `aps-environment: development`.
- **Recommendation:** For production builds, switch to production mode if the OneSignal plugin supports it (e.g. `mode: "production"` or equivalent), and use production APS environment in EAS build profiles so push notifications work in production.

## EAS Update (OTA)

- **Current:** `app.json` has `updates.url` and `runtimeVersion.policy: "appVersion"`.
- **Recommendation:** When using EAS Update in production, ensure store builds are published with a runtime version that matches the app version (e.g. `1.0.0`). OTA updates only apply to binaries that report the same runtime version; using `appVersion` policy ties runtime version to `expo.version` in app.json.

## Deep links (App Links / Universal Links)

- **Current:** Scheme `provider` and Android intentFilters for `https://beautonomi.com/provider`; iOS `associatedDomains`: `applinks:beautonomi.com`, `applinks:www.beautonomi.com`, `applinks:beautonomi.co.za`, `applinks:www.beautonomi.co.za`.
- **iOS file:** `apps/web/public/.well-known/apple-app-site-association` (no extension, JSON) declares the Provider app (`QW33CYPQX5.com.beautonomi.partner`, paths `/provider` + `/provider/*`) and the Customer app (`QW33CYPQX5.com.beautonomi`, everything else, with `/admin*`, `/api/*`, `/.well-known/*`, `/_next/*`, and `/provider*` excluded). `webcredentials` is declared for both bundles so Associated Domains unlocks password autofill. Served with `Content-Type: application/json` via `apps/web/next.config.mjs`; the legacy root `/apple-app-site-association` path is rewritten to the `.well-known` file so older clients still resolve.
- **Android file:** `apps/web/public/.well-known/assetlinks.json` lists both `com.beautonomi.partner` and `com.beautonomi` with Play App Signing SHA-256 fingerprints; apex hosts must not redirect this path (see `src/proxy.ts`).
- **Verify after deploy:**
  - `curl -sI https://beautonomi.com/.well-known/apple-app-site-association` returns `200` + `application/json` (NO redirect — Apple will refuse the file after a 301/302).
  - `curl -sI https://beautonomi.com/.well-known/assetlinks.json` same constraints.
  - On-device: long-press a `https://beautonomi.com/provider/...` link in Notes on iOS; the "Open in Beautonomi Partner" option should appear.

Without both files, `https://beautonomi.com/provider/...` links open in the browser instead of the app even when the app is installed.
