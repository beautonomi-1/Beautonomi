# Provider App – Production Readiness Audit

**Date:** 2025-03-14  
**Scope:** Full audit of `apps/provider` (Expo/React Native) for production readiness.

---

## Summary

| Area | Status | Notes |
|------|--------|------|
| TypeScript | ✅ Pass | `npx tsc --noEmit` exits 0 |
| ESLint | ✅ Pass | `npm run lint` (expo lint) exits 0 |
| IDE Lint | ✅ Pass | No linter errors in app/src |
| Auth & API | ✅ Good | Session recovery, portal check, RoleGate, onboarding |
| Config & Env | ✅ Good | Centralized public-env, .env.example, app.config.js |
| Error handling | ✅ Good | ErrorBoundary, Sentry, user-facing messages |
| Security | ✅ Good | No hardcoded secrets; debug agent-log removed |
| Production config | ⚠️ See notes | OneSignal/EAS; iOS aps-environment; store URLs |

---

## 1. Structure & dependencies

- **Framework:** Expo SDK ~54, React 19.1, React Native 0.81, expo-router.
- **Key deps:** @supabase/supabase-js, @beautonomi/api, @sentry/react-native, react-native-onesignal, i18next, nativewind, react-native-qrcode-svg, singular-react-native.
- **Scripts:** `typecheck`, `lint`, `test`, `dev`/`start` (port-safe 8082), `ios`/`android`/`web`.
- **Postinstall:** Builds workspace packages (`pnpm run build:packages`).

---

## 2. Configuration & environment

- **`src/config/public-env.ts`**  
  Single source for `EXPO_PUBLIC_*`: SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL, ONE_SIGNAL_APP_ID. Uses `Constants.expoConfig?.extra` and process.env; strips placeholders.

- **`app.config.js`**  
  Loads `.env.local`, injects into `extra` (Supabase, APP_URL, OneSignal App ID, Sentry DSN, APP_ENV); sets OneSignal plugin mode from `APP_ENV` (production vs development). No secrets in repo.

- **`.env.example`**  
  Documents required (Supabase, APP_URL) and optional (OneSignal, Sentry, Amplitude) vars.

- **Fixes applied in this audit:**
  - **WrongAppScreen:** Uses `APP_URL` from `@/config/public-env` instead of `process.env.EXPO_PUBLIC_APP_URL`.
  - **packages-list.tsx:** Uses `APP_URL` from `@/config/public-env` for “Open web” package URL.
  - **AuthProvider:** Removed debug agent-log `fetch` calls to `http://127.0.0.1:7243/ingest/...` (updateSession, getSession.then, onAuthStateChange).
- **auth-storage.native.ts:** Removed agent-log fetches from getItem/setItem (success and catch paths).
- **login.tsx:** Removed agent-log fetches from handleVerifyOtp, handleOAuth, and handleEmailLogin success paths. Production builds must not call internal dev endpoints.

---

## 3. Auth & API

- **AuthProvider:** Session from Supabase; getSession + onAuthStateChange; redirect URL from `APP_URL` or `makeRedirectUri` (native); OTP, OAuth, email sign-in/sign-up; auto-refresh on app focus (native).
- **Portal check (`app/index.tsx`):** After login, GET `/api/me/portal`; if customer or admin → WrongAppScreen (with “Open Admin on Web” when admin); cache 10 min; fallback to “ok” on error/timeout so user isn’t stuck.
- **Profile check:** GET `/api/provider/profile`; no profile → redirect to onboarding; retry once on 401; timeout shows “Couldn’t load your profile” + Retry.
- **RoleGate:** GET `/api/me/role`; only `provider_owner` and `provider_staff` allowed; else “This app is for providers only” + sign out. Single retry on timeout/network.
- **API client (`src/lib/api-client.ts`):** createApiClient with APP_URL and getAccessToken (getUser + getSession). 401 → refresh session + retry once; then sign out. All methods wrapped with session recovery. Web dev: localhost:8081/8082 → backend at localhost:3000.
- **Auth callback:** Handles code/tokens (web hash vs native params); exchangeCodeForSession; verifyOtp for token_hash; sets `role: "provider_owner"`; replace to app root or (app)/(tabs).

---

## 4. Error handling & observability

- **ErrorBoundary:** Wraps root in `_layout.tsx`; componentDidCatch → captureError (Sentry) + fallback UI “Something went wrong” + “Tap to retry”.
- **Sentry:** init in root (DSN from extra/process.env); `enabled: !__DEV__`; environment dev/production; beforeSend strips user.ip_address; root layout wrapped with Sentry.wrap().
- **OfflineBar:** Shown when offline (NetInfo).
- **ForceUpdateGate:** useForceUpdate checks `/api/public/app-version`; force or optional update alerts with store links via `openAppStoreUpdate` (iOS listing `id6748387936`, Play `com.beautonomi.partner`).

---

## 5. Security

- No hardcoded API keys or secrets in app code. Supabase anon key and APP_URL are public-by-design; sensitive operations are server-side.
- Sentry DSN and OneSignal App ID are optional and documented in .env.example.
- Singular SDK keys referenced in lib from env/extra (EAS secrets; not committed).
- Debug/agent-log HTTP calls to localhost have been removed from AuthProvider.

---

## 6. Production build & deploy

- **EAS:** `eas.json` has development, preview, production profiles. Production sets `APP_ENV=production`, autoIncrement, Sentry upload flags (SENTRY_DISABLE_AUTO_UPLOAD / SENTRY_ALLOW_FAILURE). Submit config for iOS (ascAppId 6748387936) and Android (track internal, releaseStatus draft).
- **OneSignal:** app.config.js sets plugin mode from APP_ENV. Production EAS build gets OneSignal in production mode.
- **iOS `aps-environment`:** In `app.json`, entitlements.aps-environment is `"development"`. For production App Store builds, confirm EAS production credentials use production APNs (e.g. distribution certificate).
- **Deep links:** provider:// scheme; applinks for beautonomi.com; Android intentFilters for https beautonomi.com/provider. Auth callback and index handle redirects.

---

## 7. Recommendations

1. **iOS push (production):** Verify production builds use production APNs (aps-environment: production) via EAS credentials.
2. **Store URLs:** iOS listing defaults to `id6748387936` (`IOS_APP_STORE_ID` / EAS). Confirm EAS `EXPO_PUBLIC_IOS_APP_STORE_ID` matches App Store Connect.
3. **E2E / smoke:** Add a minimal smoke test (e.g. open app, login redirect or dashboard loads) if not already in CI.
4. **Changelog / release notes:** Keep a short CHANGELOG or release notes for store submissions.

---

## 8. Checklist before release

- [ ] `.env.local` (or EAS Secrets) set for production: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_APP_URL; optional OneSignal, Sentry.
- [ ] Production backend (apps/web) deployed and APP_URL correct.
- [ ] Run `pnpm typecheck` and `pnpm lint` in apps/provider.
- [ ] Build: `eas build --profile production --platform ios` (and android); test install.
- [ ] Confirm OneSignal and Sentry in production mode for production builds.
- [ ] Verify OAuth (Google/Apple) redirect and callback in production. iOS Sign in with Apple needs the App ID capability, regenerated provisioning profile (`com.apple.developer.applesignin`), and a new EAS iOS build.
- [ ] Confirm iOS listing ID `6748387936` is set in EAS (`EXPO_PUBLIC_IOS_APP_STORE_ID`).

---

**Conclusion:** The provider app is in good shape for production. TypeScript and lint pass; auth, API, and config are consistent and env-driven; error handling and Sentry are in place. Changes in this audit: use APP_URL from config in WrongAppScreen and packages-list, and removal of debug agent-log fetches from AuthProvider. Confirm iOS aps-environment and store URLs for your production checklist.
