# Provider App – Expo & Production Notes

Optional follow-ups from the Provider Completeness and Expo Alignment audit. Address these when preparing production builds or deploying OTA updates.

## OneSignal

- **Current:** `app.json` plugins use `["onesignal-expo-plugin", { "mode": "development" }]` and iOS entitlements use `aps-environment: development`.
- **Recommendation:** For production builds, switch to production mode if the OneSignal plugin supports it (e.g. `mode: "production"` or equivalent), and use production APS environment in EAS build profiles so push notifications work in production.

## EAS Update (OTA)

- **Current:** `app.json` has `updates.url` and `runtimeVersion.policy: "appVersion"`.
- **Recommendation:** When using EAS Update in production, ensure store builds are published with a runtime version that matches the app version (e.g. `1.0.0`). OTA updates only apply to binaries that report the same runtime version; using `appVersion` policy ties runtime version to `expo.version` in app.json.

## Deep links (App Links / Universal Links)

- **Current:** Scheme `provider` and Android intentFilters for `https://beautonomi.com/provider`; iOS `associatedDomains`: `applinks:beautonomi.com`, `applinks:www.beautonomi.com`.
- **Recommendation:** Confirm the backend (or static host) serves:
  - **iOS:** `/.well-known/apple-app-site-association` (or `https://beautonomi.com/apple-app-site-association`) with an `applinks` entry for the provider app (e.g. `paths: ["/provider", "/provider/*"]`).
  - **Android:** `https://beautonomi.com/.well-known/assetlinks.json` with a statement for `com.beautonomi.partner` and the correct SHA-256 fingerprint of the signing key.

Without these, `https://beautonomi.com/provider/...` links may open in the browser instead of the app when the app is installed.
