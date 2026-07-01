# Amplitude Surveys and Guides by Platform

## Summary

| Platform | Analytics (events) | Guides | Surveys |
|----------|--------------------|--------|---------|
| **Web** (Next.js) | ✅ Browser SDK + server-side | ✅ `@amplitude/engagement-browser` plugin (when enabled) | ✅ `@amplitude/engagement-browser` plugin (when enabled) |
| **Provider mobile** (Expo/RN) | ✅ React Native SDK | ✅ Engagement plugin (when enabled) | ✅ Engagement plugin (when enabled) |
| **Customer mobile** (Expo/RN) | ✅ React Native SDK | ✅ Engagement plugin (when enabled) | ✅ Engagement plugin (when enabled) |

Config (`guides_enabled`, `surveys_enabled`) is fetched from `/api/public/analytics-config` on all platforms. On **web**, `AmplitudeEngagementProvider` registers the bundled `@amplitude/engagement-browser` plugin on the analytics instance (Popover-capable browsers only). On **mobile**, the same API key and flags are used: when either flag is true, the Engagement plugin (`@amplitude/plugin-engagement-react-native`) is added after `initAnalytics()`, and deep links are wired for preview/guide URLs. All targeting/triggering/frequency lives in the Amplitude dashboard, not in app code.

---

## How it works

### Web (Next.js)

1. **Config** — `AmplitudeProvider` fetches `/api/public/analytics-config` and gets `guides_enabled`, `surveys_enabled`, and `api_key_public`.
2. **Guides & Surveys** — When `api_key_public` is set and either `guides_enabled` or `surveys_enabled` is true, `AmplitudeEngagementProvider` dynamically imports the official `@amplitude/engagement-browser` plugin and registers it on the same `@amplitude/analytics-browser` instance via `amplitude.add()`. The plugin is bundled (no CDN `<script>` tags that can 401/403 or be blocked by ad blockers) and auto-picks up the identity set by `identify()`. All targeting, triggering, and frequency capping is configured in the **Amplitude dashboard** — there is no custom eligibility code in the app.
3. **Browser requirement** — The engagement runtime uses the native Popover API (`showPopover`/`hidePopover`/`togglePopover`). `AmplitudeEngagementProvider` feature-detects this and **skips registering the plugin on browsers without it** (e.g. Safari &lt; 16.4) so analytics still works. On those browsers guides/surveys will not appear.
4. **Consent & role gating** — Nothing initializes until cookie/account analytics consent passes (`allowsAnalytics`), and `superadmin` is fully excluded. Non-consented users and superadmins never see guides/surveys.

### Mobile (Provider and Customer) — implemented

1. **Config** — Both apps use `@beautonomi/analytics`: `fetchAmplitudeConfig(APP_URL, environment)` and get the same `guides_enabled` and `surveys_enabled` as web.
2. **Init** — `initAnalytics(config, "provider" | "client")` in `packages/analytics/src/react-native.ts`:
   - Initializes the Amplitude Analytics React Native SDK (`@amplitude/analytics-react-native`).
   - Mobile does not load Amplitude Session Replay; keeping replay out of the native dependency graph avoids Android/EAS Gradle metadata resolution failures.
   - If `config.guides_enabled || config.surveys_enabled`, adds the Engagement plugin: `add(getPlugin())` from `@amplitude/plugin-engagement-react-native`.
3. **Boot** — When the app calls `client.identify(userId, userProperties)`, the module also calls `getPlugin().boot(userId, deviceId)` so Guides and Surveys can be shown (same identity as Analytics for CDP). The device id is resolved from `amplitude.getDeviceId()` so guides/surveys share the exact device identity as events.
4. **Signed-in requirement (mobile)** — Boot happens on `identify()`, so on mobile guides/surveys target **signed-in** users. Logged-out/anonymous mobile sessions do not boot the plugin (by design). To target anonymous onboarding on mobile, call `bootEngagement` with the device id before sign-in.
5. **Deep links** — In each app’s `AnalyticsProvider`, `Linking.getInitialURL()` and `Linking.addEventListener('url', …)` call `handleEngagementURL(url)` from `@beautonomi/analytics/react-native`. If the URL is handled by Amplitude (e.g. guide/survey preview), it returns `true`; otherwise the app can handle it (e.g. notification deep links).
6. **Same API key** — The same `api_key_public` is used for Analytics and for Guides & Surveys on web and mobile, so data stays in one Amplitude project and supports [Amplitude CDP](https://amplitude.com/docs/apis) and Analytics/Data APIs.

---

## Amplitude CDP and APIs

- **APIs:** [Amplitude APIs](https://amplitude.com/docs/apis) include **Analytics and Data APIs**, **Experiment APIs**, and **Guides and Surveys Translation API**. Using the same API key across web and mobile (and optional server-side tracking) keeps identity and events in one project for CDP use cases.
- **Identity:** Web and mobile both call `identify(userId, userProperties)`. On mobile, `identify()` also boots the Engagement plugin with that userId so guides/surveys are tied to the same user.
- **Server-side:** The web app can send events server-side via `apps/web/src/lib/analytics/amplitude/server.ts` (Amplitude HTTP API). Mobile uses the React Native SDK only; for CDP you can add server-side identity/event sync via the same APIs if needed.

---

## Config source (all platforms)

- **Endpoint:** `GET /api/public/analytics-config?environment=production|staging|development`
- **Source of truth:** `amplitude_integration_config` (admin sets `guides_enabled`, `surveys_enabled` in Amplitude/integration settings).
- **Web:** Used by `AmplitudeProvider` and `AmplitudeEngagementProvider`.
- **Mobile:** Used by `fetchAmplitudeConfig()` in `@beautonomi/analytics`; `initAnalytics()` uses it for Analytics and for gating the Engagement plugin.

---

## Mobile implementation details

- **Package:** `@beautonomi/analytics` depends on `@amplitude/plugin-engagement-react-native` (^3.6.0). Provider and customer apps already depend on `@react-native-async-storage/async-storage` (required by the engagement plugin).
- **Exports from `@beautonomi/analytics/react-native`:** `initAnalytics`, `handleEngagementURL`, `bootEngagement`, `isEngagementEnabled`, `getAnalyticsClient`.
- **Native build:** After adding or updating the engagement plugin, run `pnpm install`. With Expo, a development build / prebuild is required so the native engagement module is linked (it will not work in Expo Go). `tooling/patch-amplitude-android-gradle.mjs` pins the plugin's dynamic `com.amplitude:analytics-android:1.+` range to avoid EAS Gradle resolution failures.
- **Preview / deep links:** `handleEngagementURL` is already wired for incoming URLs in both apps’ `AnalyticsProvider`. Previewing unpublished guides/surveys on device additionally requires the Amplitude URL scheme to be registered — see below.

### Amplitude URL scheme for preview (wired, config-driven)

Published guides/surveys do **not** need this. It is only required to preview **unpublished** guides/surveys on a device from the Amplitude dashboard.

- **Value:** From Amplitude → Settings → Projects → your project → **URL scheme (mobile)**, e.g. `amp-abcdef12345678`.
- **How to enable:** Set `EXPO_PUBLIC_AMPLITUDE_URL_SCHEME` in the app's `.env.local` (and in the matching EAS build profile). When set, `apps/customer/app.config.js` and `apps/provider/app.config.js` automatically register:
  - **iOS:** an `ios.infoPlist.CFBundleURLTypes` entry (`CFBundleURLName: "AmplitudeURLScheme"`).
  - **Android:** an extra `VIEW` intent-filter with `data.scheme` set to the value.
- **Rebuild required:** Because this changes native config, you must create a new development/EAS build after setting the variable (a JS/OTA update is not enough).
