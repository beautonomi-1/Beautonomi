# Screenshot automation — implementation report

## Chosen approach: **Maestro + screenshot-mode deep links**

**Maestro** was selected because:

- There was **no existing Detox or Maestro** wiring in the monorepo; adding Detox would require significant native test harness work for two Expo apps.
- Maestro drives the **real app** on a **real emulator**, matches store-like conditions, and supports **`openLink`**, **`waitForAnimationToEnd`**, **`extendedWaitUntil`**, and **`takeScreenshot`** with **`--test-output-dir`** for deterministic output paths.
- Flows are **plain YAML**, easy for release/QA to extend without recompiling tests.
- The same flow **structure** ports to **iOS** when the team is ready (Maestro supports iOS; this repo currently targets Android execution).

**Alternatives considered:** Detox (heavy setup), raw **adb** without a flow runner (brittle for navigation), **Playwright** (web-only for these native apps).

## Apps covered

| App | Package / scheme | Maestro flows |
|-----|------------------|---------------|
| Customer | `com.beautonomi`, `customer://` | `customer.android.public.yaml`, `customer.android.authenticated.yaml` |
| Provider | `com.beautonomi.partner`, `provider://` | `provider.android.public.yaml`, `provider.android.authenticated.yaml` |

## Flows implemented

### Customer

| # | Intent | Flow | Notes |
|---|--------|------|--------|
| 1 | Welcome / sign-in | Public → login | Asserts “Welcome to Beautonomi” |
| 2 | Onboarding / sign-up | Public → signup | Asserts “Create Your Account” |
| 3 | Explore / feed | Auth → `tabs/explore` | Needs session |
| 4 | Home | Auth → `tabs/home` | Needs session |
| 5 | Provider profile | Auth → `partner-profile` | Needs `EXPO_PUBLIC_SCREENSHOT_PROVIDER_SLUG` or `provider_id` |
| 6 | Booking step | Auth → `book` | Same slug/id env |
| 7 | Book checkout | Auth → `book-checkout` | Needs `EXPO_PUBLIC_SCREENSHOT_HOLD_ID` for a real hold |
| 8 | Cart | Auth → `cart` | |
| 9 | Product checkout | Auth → `product-checkout` | |
| 10 | Bookings / history | Auth → `tabs/bookings` | |
| 11 | Booking detail | Auth → `booking-detail` | Needs `EXPO_PUBLIC_SCREENSHOT_BOOKING_ID` |
| 12 | Profile | Auth → `tabs/profile` | |
| 13 | Account settings | Auth → `account-settings` | |
| 14 | Shop | Auth → `shop` | |

### Provider

| # | Intent | Flow | Notes |
|---|--------|------|--------|
| 1 | Login / welcome | Public → `auth/login` | Run signed out |
| 2 | Dashboard | Auth → `tabs/dashboard` | |
| 3 | Bookings list | Auth → `more/bookings` | |
| 4 | Calendar | Auth → `tabs/calendar` | |
| 5 | Clients | Auth → `tabs/clients` | |
| 6 | Booking detail | Auth → `more/booking-detail` | Needs `EXPO_PUBLIC_SCREENSHOT_BOOKING_ID` |
| 7 | Service / business setup | Auth → `more/service-form` | |
| 8 | Earnings | Auth → `more/my-earnings` | |
| 9 | Finance hub | Auth → `more/finance-hub` | |
| 10 | Reports | Auth → `more/reports` | |
| 11 | Profile / settings | Auth → `more/profile` | |
| 12 | Catalogue / services | Auth → `more/catalogue` | |
| 13 | Business settings | Auth → `more/settings/business` | |

## Code hooks (safe, opt-in)

- **`EXPO_PUBLIC_SCREENSHOT_MODE`** — read via `isScreenshotMode()` in `apps/*/src/config/public-env.ts`.
- **`ScreenshotDeepLinkBootstrap`** — mounted in each app root `app/_layout.tsx`.
- **Gates**: Maintenance fetch skipped, offline bar suppressed, native permission onboarding skipped, market modal logic skipped, faster routing from `app/index.tsx` for screenshot mode.

## Screenshots produced (naming)

PNG names are fixed in YAML (`cu_*`, `pr_*`) so runs are **repeatable** and **diff-friendly** for tooling.

Output directory per app: `screenshots/<app>/android/` (via `maestro test --test-output-dir`).

## Current limitations

1. **No automated login** in Maestro flows — **public** and **authenticated** sets are **split**; marketing must sign in between runs or use a persisted session on the emulator.
2. **Tooling**: **`pnpm screenshots:setup`** vendors Maestro under `tooling/screenshots/.tools/`; **JDK 17+** and **Android SDK / emulator** are still required locally. Run `pnpm screenshots:android:customer:auth` once your emulator and app are up.
3. **Optional env-dependent screens** (booking detail, book checkout) still capture even if env is empty — the app may **not navigate**, so the PNG may duplicate the previous screen. Fill env or trim YAML steps for your shoot.
4. **Expo dev menu / red error overlay** — not disabled in code; use a build without dev overlay for final store assets.
5. **Customer typecheck** currently reports **pre-existing** errors in unrelated files; new screenshot files were kept type-clean.

## What is needed for iOS simulator support

1. Maestro iOS toolchain + booted simulator.
2. iOS builds with the same `EXPO_PUBLIC_SCREENSHOT_MODE` and URL schemes.
3. Duplicate or parameterize YAML (`appId` / flow file) and set `--test-output-dir` to `screenshots/*/ios-prep/`.
4. Optional: separate **device presets** (6.7", 6.1") via multiple output folders or Maestro config.

## Play Store / App Store submission quality

- **Resize** emulator output to required **pixel dimensions** per current store docs.
- **Remove** any remaining debug UI, **toasts**, and **PII**; use staging + demo accounts.
- **Localize** if listing is multi-locale (duplicate flows per language or snapshot after i18n switch).
- **Contrast and safe areas** — verify notches and Android gesture bars; consider `cropOn` in Maestro for specific components if needed.

## Files added or changed (summary)

| Area | Path |
|------|------|
| Maestro flows | `tooling/screenshots/maestro/*.yaml` |
| Scripts | `tooling/screenshots/scripts/capture.mjs`, `clean.mjs` |
| Docs | `SCREENSHOT_AUTOMATION.md`, `SCREENSHOT_AUTOMATION_REPORT.md` |
| Root scripts | `package.json` |
| Gitignore | `screenshots/**/*.png` |
| Customer/provider env examples | `apps/*/ .env.example` |
| App hooks | `ScreenshotDeepLinkBootstrap.tsx`, `public-env.ts`, gates, `app/index.tsx`, `(app)/_layout.tsx` |

This delivers a **reusable, release-oriented** capture pipeline with a clear path to iOS and to stricter store polish as your staging data and builds mature.
