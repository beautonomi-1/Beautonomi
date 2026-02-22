# Amplitude Surveys and Guides by Platform

## Summary

| Platform | Analytics (events) | Guides | Surveys |
|----------|--------------------|--------|---------|
| **Web** (Next.js) | ✅ Browser SDK + server-side | ✅ CDN script + custom eligibility | ✅ CDN script + SurveyManager + frequency cap |
| **Provider mobile** (Expo/RN) | ✅ React Native SDK | ✅ Engagement plugin (when enabled) | ✅ Engagement plugin (when enabled) |
| **Customer mobile** (Expo/RN) | ✅ React Native SDK | ✅ Engagement plugin (when enabled) | ✅ Engagement plugin (when enabled) |

Config (`guides_enabled`, `surveys_enabled`) is fetched from `/api/public/analytics-config` on all platforms. **Mobile** uses the same API key and flags as web: when either flag is true, the Engagement plugin (`@amplitude/plugin-engagement-react-native`) is added after `initAnalytics()`, and deep links are wired for preview/guide URLs.

---

## How it works

### Web (Next.js)

1. **Config** — `AmplitudeProvider` fetches `/api/public/analytics-config` and gets `guides_enabled`, `surveys_enabled`, and `api_key_public`.
2. **Guides** — When `guides_enabled` and `api_key_public` are set, `AmplitudeGuidesProvider` injects the Amplitude Guides browser script from CDN and initializes it. Custom logic in `apps/web/src/lib/analytics/amplitude/guides.ts` uses **localStorage** for eligibility (e.g. don’t show again if dismissed).
3. **Surveys** — When `surveys_enabled` and `api_key_public` are set, `AmplitudeSurveysProvider` injects the Surveys browser script. Custom logic in `surveys.ts` (SurveyManager, frequency capping) uses **localStorage**. Built-in triggers: onboarding, provider satisfaction, post-booking, post-payout, quarterly NPS.

### Mobile (Provider and Customer) — implemented

1. **Config** — Both apps use `@beautonomi/analytics`: `fetchAmplitudeConfig(APP_URL, environment)` and get the same `guides_enabled` and `surveys_enabled` as web.
2. **Init** — `initAnalytics(config, "provider" | "client")` in `packages/analytics/src/react-native.ts`:
   - Initializes the Amplitude Analytics React Native SDK (`@amplitude/analytics-react-native`).
   - If `config.guides_enabled || config.surveys_enabled`, adds the Engagement plugin: `add(getPlugin())` from `@amplitude/plugin-engagement-react-native`.
3. **Boot** — When the app calls `client.identify(userId, userProperties)`, the module also calls `getPlugin().boot(userId, deviceId?)` so Guides and Surveys can be shown (same identity as Analytics for CDP).
4. **Deep links** — In each app’s `AnalyticsProvider`, `Linking.getInitialURL()` and `Linking.addEventListener('url', …)` call `handleEngagementURL(url)` from `@beautonomi/analytics/react-native`. If the URL is handled by Amplitude (e.g. guide/survey preview), it returns `true`; otherwise the app can handle it (e.g. notification deep links).
5. **Same API key** — The same `api_key_public` is used for Analytics and for Guides & Surveys on web and mobile, so data stays in one Amplitude project and supports [Amplitude CDP](https://amplitude.com/docs/apis) and Analytics/Data APIs.

---

## Amplitude CDP and APIs

- **APIs:** [Amplitude APIs](https://amplitude.com/docs/apis) include **Analytics and Data APIs**, **Experiment APIs**, and **Guides and Surveys Translation API**. Using the same API key across web and mobile (and optional server-side tracking) keeps identity and events in one project for CDP use cases.
- **Identity:** Web and mobile both call `identify(userId, userProperties)`. On mobile, `identify()` also boots the Engagement plugin with that userId so guides/surveys are tied to the same user.
- **Server-side:** The web app can send events server-side via `apps/web/src/lib/analytics/amplitude/server.ts` (Amplitude HTTP API). Mobile uses the React Native SDK only; for CDP you can add server-side identity/event sync via the same APIs if needed.

---

## Config source (all platforms)

- **Endpoint:** `GET /api/public/analytics-config?environment=production|staging|development`
- **Source of truth:** `amplitude_integration_config` (admin sets `guides_enabled`, `surveys_enabled` in Amplitude/integration settings).
- **Web:** Used by `AmplitudeProvider` and the Guides/Surveys providers.
- **Mobile:** Used by `fetchAmplitudeConfig()` in `@beautonomi/analytics`; `initAnalytics()` uses it for Analytics and for gating the Engagement plugin.

---

## Mobile implementation details

- **Package:** `@beautonomi/analytics` depends on `@amplitude/plugin-engagement-react-native` (^3.0.0). Provider and customer apps already depend on `@react-native-async-storage/async-storage` (required by the engagement plugin).
- **Exports from `@beautonomi/analytics/react-native`:** `initAnalytics`, `handleEngagementURL`, `bootEngagement`, `isEngagementEnabled`, `getAnalyticsClient`.
- **Native build:** After adding or updating the engagement plugin, run `pnpm install` and, for bare workflow, `cd ios && pod install`. With Expo, a development build or prebuild may be needed so the native engagement module is linked.
- **Preview / deep links:** To preview guides and surveys on device, configure the Amplitude URL scheme in your project (see [Amplitude Guides and Surveys React Native SDK](https://amplitude.com/docs/guides-and-surveys/guides-and-surveys-rn-sdk)) and ensure `handleEngagementURL` is called for incoming URLs (already wired in both apps’ `AnalyticsProvider`).

### Optional: Amplitude URL scheme for preview

The scheme value comes from Amplitude (Settings > Projects > your project > URL scheme (mobile)). To support preview links (e.g. `amp-xxxx://...`) in Expo, you can add a second scheme so both your app and Amplitude preview work:

- **Expo:** In `app.json`, you can add a plugin or manually add the scheme to the native config. For a bare/prebuild workflow, add the scheme in Xcode (URL Types) and in Android `AndroidManifest.xml` (intent-filter with `data android:scheme="amp-xxxx"`). Replace `amp-xxxx` with the value from your Amplitude project.
- **Example (iOS URL type in Xcode):** URL Schemes = `amp-abcdef12345678`, Identifier = `AmplitudeURLScheme`.
- **Example (Android intent-filter):** Add a second `data` element with `android:scheme="amp-abcdef12345678"` to your main activity’s VIEW intent-filter, or a separate intent-filter for the Amplitude scheme.
