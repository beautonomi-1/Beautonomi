# Customer App – Production Readiness Audit

**Date:** 2025-03-14  
**Scope:** Full audit of `apps/customer` (Expo/React Native) for production readiness.

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| TypeScript | ✅ Pass | `npx tsc --noEmit` exits 0 |
| ESLint | ✅ Pass | `npm run lint` (expo lint) exits 0 |
| IDE Lint | ✅ Pass | No linter errors in app/src |
| Auth & API | ✅ Good | Session recovery, role gate, portal check |
| Config & Env | ✅ Good | Centralized public-env, .env.example, app.config.js |
| Error handling | ✅ Good | ErrorBoundary, Sentry, user-facing messages |
| Security | ✅ Good | No hardcoded secrets; env-based config |
| Production config | ⚠️ See notes | OneSignal/EAS; iOS aps-environment |

---

## 1. Structure & dependencies

- **Framework:** Expo SDK ~54, React 19.1, React Native 0.81, expo-router.
- **Key deps:** @supabase/supabase-js, @beautonomi/api, @sentry/react-native, react-native-onesignal, i18next, nativewind.
- **Scripts:** `typecheck`, `lint`, `test`, `dev`/`start` (port-safe), `ios`/`android`/`web`.
- **Postinstall:** Builds workspace packages (`pnpm run build:packages`).

---

## 2. Configuration & environment

- **`src/config/public-env.ts`**  
  Single source for `EXPO_PUBLIC_*`: SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL, ONE_SIGNAL_APP_ID. Uses `Constants.expoConfig?.extra` and process.env; strips placeholders.

- **`app.config.js`**  
  Loads `.env.local`, injects into `extra`; sets OneSignal plugin mode from `APP_ENV` (production vs development). No secrets in repo.

- **`.env.example`**  
  Documents required (Supabase, APP_URL) and optional (OneSignal, Sentry, etc.) vars. Paystack/Mapbox noted as server-side.

- **Fix applied:** Forgot-password screen now uses `APP_URL` from `@/config/public-env` for `redirectTo` instead of `process.env.EXPO_PUBLIC_APP_URL`, so it matches the rest of the app and works with EAS builds.

---

## 3. Auth & API

- **AuthProvider:** Session from Supabase; getSession + onAuthStateChange; refresh on app focus; OTP, OAuth, email sign-in/sign-up; redirect URL from `APP_URL` or `makeRedirectUri` (native).
- **Portal check (`app/index.tsx`):** After login, GET `/api/me/portal`; if provider/admin → WrongAppScreen; cache 10 min; fallback to customer on error.
- **Profile completion:** GET `/api/me/profile-completion`; redirect to personal-info if required items incomplete; don’t block on error.
- **RoleGate:** GET `/api/me/role`; only `customer` allowed; else “This app is for customers only” + sign out.
- **API client (`src/lib/api-client.ts`):** createApiClient with APP_URL and getAccessToken from Supabase session. 401 → refresh session + retry once; then sign out. All methods wrapped with session recovery.
- **Auth callback:** Handles code/tokens (web hash vs native params); exchangeCodeForSession; replace to home or close popup.

---

## 4. Error handling & observability

- **ErrorBoundary:** Wraps root in `_layout.tsx`; componentDidCatch → captureError (Sentry) + console.error; fallback UI “Something went wrong” + “Tap to retry”. Error message shown only in `__DEV__`; production shows generic text.
- **Sentry:** init in root (dsn from env); `enabled: !__DEV__`; environment dev/production; beforeSend strips user.ip_address; root layout wrapped with Sentry.wrap().
- **useApi:** Loading, error, timedOut, refresh, mutate; getApiErrorMessage for user-facing text; cancellation on unmount.
- **OfflineBar:** NetInfo; shows “No internet connection” when offline.

---

## 5. Security

- No hardcoded API keys or secrets in app code. Supabase anon key and APP_URL are public-by-design; sensitive ops are server-side.
- Sentry DSN and OneSignal App ID are optional and documented in .env.example.
- Singular SDK keys referenced only in lib (EAS secrets; not committed).

---

## 6. Production build & deploy

- **EAS:** `eas.json` has development, preview, production profiles. Production sets `APP_ENV=production`, autoIncrement, iOS/Android images, Sentry upload flags.
- **OneSignal:** app.config.js sets plugin mode from APP_ENV (production vs development). Production EAS build gets OneSignal in production mode.
- **iOS `aps-environment`:** In `app.json`, entitlements.aps-environment is `"development"`. For production App Store builds, EAS typically overrides this via production profile / credentials (e.g. distribution certificate). Confirm with `eas credentials` and a production build that push uses the production APNs environment.
- **Deep links:** customer:// scheme; applinks for beautonomi.com; intent filters on Android. Index redirects and (app) _layout handle customer deep links.

---

## 7. Recommendations

1. **iOS push (production):** Verify that production builds use production APNs (aps-environment: production) via EAS credentials. If not, add an override in eas.json or use a production entitlements file.
2. **Store URLs:** iOS listing defaults to `id6748387058` (`IOS_APP_STORE_ID` / EAS). Confirm EAS `EXPO_PUBLIC_IOS_APP_STORE_ID` matches App Store Connect.
3. **E2E / smoke:** Add a minimal smoke test (e.g. open app, login redirect or home loads) if not already in CI.
4. **Changelog / release notes:** Keep a short CHANGELOG or release notes for store submissions.

---

## 8. Checklist before release

- [ ] `.env.local` (or EAS Secrets) set for production: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_APP_URL, optional OneSignal/Sentry.
- [ ] Production backend (apps/web) deployed and APP_URL correct.
- [ ] Run `pnpm typecheck` and `pnpm lint` in apps/customer.
- [ ] Build: `eas build --profile production --platform ios` (and android); test install.
- [ ] Confirm OneSignal and Sentry in production mode for production builds.
- [ ] Verify password reset flow (forgot-password → email link → web reset page).
- [ ] Verify OAuth (Google/Apple) redirect and callback in production. iOS Sign in with Apple needs the App ID capability, regenerated provisioning profile (`com.apple.developer.applesignin`), and a new EAS iOS build.
- [ ] Confirm iOS listing ID `6748387058` is set in EAS (`EXPO_PUBLIC_IOS_APP_STORE_ID`).

---

**Conclusion:** The customer app is in good shape for production. TypeScript and lint pass; auth, API, and config are consistent and env-driven; error handling and Sentry are in place; the only code change in this audit was aligning forgot-password redirect with APP_URL. Confirm iOS aps-environment and store URLs for your production checklist.
