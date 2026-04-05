# Screenshot automation (Expo / Android / Maestro)

This repo uses **[Maestro](https://docs.maestro.dev/)** for scripted UI navigation and **`takeScreenshot`** for store-ready PNGs. Flows are **platform-agnostic YAML** so the same steps can be replayed later on **iOS Simulator** with minimal changes (see below).

## One-time machine setup (automated)

From the **repo root**:

```bash
pnpm screenshots:setup
```

This downloads the **Maestro CLI** into `tooling/screenshots/.tools/` (gitignored). The capture script uses that binary automatically; you do not need a global `maestro` on `PATH`.

**JDK 17+** is required for Maestro. If `java` is missing:

```bash
winget install Microsoft.OpenJDK.17
```

(Approve the admin prompt if Windows asks.) The capture script sets `JAVA_HOME` automatically when the Microsoft JDK is installed under `C:\Program Files\Microsoft\jdk-*`.

**adb (Android Debug Bridge)** — on Windows you can install platform-tools without full Android Studio:

```bash
winget install Google.PlatformTools
```

Open a **new** terminal afterward so `adb` is on `PATH`. The capture script also detects the WinGet install under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Google.PlatformTools_*`.

**Check everything:**

```bash
pnpm screenshots:doctor
```

You still need a **device**: USB-connected phone (debugging on) or an **emulator** from Android Studio.

Copy screenshot env flags into each app (or merge `tooling/screenshots/env-screenshots.snippet` into `apps/customer/.env.local` and `apps/provider/.env.local`).

## Prerequisites

1. **Android Studio** — install SDK + create an AVD (e.g. Pixel 8, portrait). For Play Store–style assets, use a **phone** profile; resolution should match your target listing (often 1080×1920 class devices).
2. **`ANDROID_HOME` or `ANDROID_SDK_ROOT`** — so `platform-tools/adb` resolves (the capture script warns if missing).
3. **Maestro CLI** — use **`pnpm screenshots:setup`** (above), or install globally: [Installing Maestro](https://docs.maestro.dev/getting-started/installing-maestro).
4. **Expo dev client** (or a release-style build) installed on the emulator for `com.beautonomi` (customer) and `com.beautonomi.partner` (provider).
5. **Backend** — `EXPO_PUBLIC_APP_URL` must point at a running `apps/web` instance with real data for polished screens (or staging).
6. **Screenshot mode** — add to each app’s **`.env.local`** (never production EAS secrets):

   ```bash
   EXPO_PUBLIC_SCREENSHOT_MODE=1
   ```

   Optional customer env for deep-link targets (see `apps/customer/.env.example`):

   - `EXPO_PUBLIC_SCREENSHOT_PROVIDER_SLUG` or `EXPO_PUBLIC_SCREENSHOT_PROVIDER_ID`
   - `EXPO_PUBLIC_SCREENSHOT_BOOKING_ID`
   - `EXPO_PUBLIC_SCREENSHOT_HOLD_ID`

   Restart Metro after changing env.

## What screenshot mode does

When `EXPO_PUBLIC_SCREENSHOT_MODE` is `1` / `true` / `yes`:

- **`customer://screenshot/...`** and **`provider://screenshot/...`** deep links are handled (see `ScreenshotDeepLinkBootstrap.tsx` in each app).
- **Maintenance** HTTP gate is skipped (no “maintenance” screen from API during capture).
- **Offline bar** is hidden (avoids “No internet connection” in studio shots).
- **Native permission onboarding** modal is skipped.
- **Market availability** modal logic is not applied.
- **Customer** post-login profile-completion wait and **provider** profile/onboarding gating are short-circuited to **home** / **dashboard** so flows reach tabs faster (use a **demo account** that is valid for your backend).

Deep links are **ignored** when screenshot mode is off, so production builds without the flag are not affected.

## Output layout

PNG files are written under:

| App      | Android output                    | iOS prep (placeholder)        |
|----------|-----------------------------------|-------------------------------|
| Customer | `screenshots/customer/android/`  | `screenshots/customer/ios-prep/` |
| Provider | `screenshots/provider/android/`  | `screenshots/provider/ios-prep/` |

Generated `*.png` files are **gitignored**; folders are kept via `.gitkeep`.

## Run the app on the emulator

From repo root (separate terminals):

```bash
pnpm dev:customer
# or from apps/customer: pnpm dev — then press a / open Android
```

```bash
pnpm dev:provider
```

Use **dev client** builds that match `app.json` `android.package` / `scheme`.

## Capture commands

From **repository root**:

| Command | Purpose |
|---------|---------|
| `pnpm screenshots:android:customer` | Same as **customer:auth** (main customer set) |
| `pnpm screenshots:android:customer:public` | Customer **login + signup** (run **signed out**) |
| `pnpm screenshots:android:customer:auth` | Customer **main store set** (run **signed in**) |
| `pnpm screenshots:android:provider` | Same as **provider:auth** (main provider set) |
| `pnpm screenshots:android:provider:public` | Provider **login welcome** (run **signed out**) |
| `pnpm screenshots:android:provider:auth` | Provider **main store set** (run **signed in**) |
| `pnpm screenshots:android:all` | Runs **customer auth** then **provider auth** only |
| `pnpm screenshots:clean` | Deletes `screenshots/**/*.png` |

From **`apps/customer`** or **`apps/provider`**:

- `pnpm screenshots:android:public`
- `pnpm screenshots:android:auth`

### Recommended release workflow

1. Emulator running; app open with screenshot env + Metro or a prebuilt binary.
2. **Signed out** → run `:public` flows for login/welcome frames.
3. Sign in with **demo customer** / **demo provider** (complete profile, realistic data).
4. Run `:auth` flows for the main set.
5. Run `pnpm screenshots:clean` before a fresh batch if you want a clean folder.

## Flow definitions

| File | Role |
|------|------|
| `tooling/screenshots/maestro/customer.android.public.yaml` | Customer auth marketing screens |
| `tooling/screenshots/maestro/customer.android.authenticated.yaml` | Customer logged-in journey |
| `tooling/screenshots/maestro/provider.android.public.yaml` | Provider login |
| `tooling/screenshots/maestro/provider.android.authenticated.yaml` | Provider logged-in journey |

Orchestration: `tooling/screenshots/scripts/capture.mjs` (invokes `maestro test … --test-output-dir <dir>`).

## Deep link reference (screenshot mode only)

### Customer (`customer://`)

| Path | Screen |
|------|--------|
| `screenshot/auth/login` | Login |
| `screenshot/auth/signup` | Signup |
| `screenshot/tabs/home` | Home tab |
| `screenshot/tabs/explore` | Explore |
| `screenshot/tabs/bookings` | Bookings |
| `screenshot/tabs/profile` | Profile |
| `screenshot/partner-profile` | Provider profile (slug/id from env or query) |
| `screenshot/book` | Booking flow |
| `screenshot/book-checkout` | Book checkout (`hold_id` from env or query) |
| `screenshot/cart` | Cart |
| `screenshot/shop` | Shop |
| `screenshot/product-checkout` | Product checkout |
| `screenshot/booking-detail` | Booking detail (`id` from env or query) |
| `screenshot/account-settings` | Account settings hub |

### Provider (`provider://`)

| Path | Screen |
|------|--------|
| `screenshot/auth/login` | Login |
| `screenshot/tabs/dashboard` | Dashboard |
| `screenshot/tabs/calendar` | Calendar |
| `screenshot/tabs/clients` | Clients |
| `screenshot/more/bookings` | Bookings list |
| `screenshot/more/booking-detail` | Booking detail (`id` from env or query) |
| `screenshot/more/service-form` | Service form |
| `screenshot/more/my-earnings` | My earnings |
| `screenshot/more/finance-hub` | Finance hub |
| `screenshot/more/reports` | Reports |
| `screenshot/more/profile` | Profile |
| `screenshot/more/catalogue` | Catalogue |
| `screenshot/more/settings/business` | Business settings |

## Stabilization & polish

- Flows use **`waitForAnimationToEnd`** with timeouts after navigation.
- Tweak timeouts in YAML if your staging API is slow.
- Avoid **Expo dev overlay** in marketing shots: prefer a **release** or **internal** build without the dev menu, or ensure the menu is closed before capture.
- **Play Store**: portrait PNGs from the emulator are usually acceptable; resize/crop per [current Play Console specs](https://support.google.com/googleplay/android-developer/).
- **App Store**: place final iPhone-sized exports under `screenshots/*/ios-prep/` after capture or use simulator + same Maestro flows when iOS is enabled.

## Extending flows

1. Add or adjust a **`screenshot/...`** branch in `ScreenshotDeepLinkBootstrap.tsx` (customer or provider).
2. Add matching **`openLink`** + wait + **`takeScreenshot`** steps in the YAML.
3. Use **deterministic** `visible:` assertions where possible (Maestro polls until timeout).

## iOS simulator (later)

1. Install Maestro with iOS support; boot a simulator (e.g. iPhone 15 Pro).
2. Duplicate the YAML files as `*.ios.yaml` or parameterize `appId` / device via Maestro workspace config.
3. Point `--test-output-dir` to `screenshots/customer/ios-prep` or `screenshots/provider/ios-prep`.
4. Build/run the iOS app with the same `EXPO_PUBLIC_SCREENSHOT_MODE` and schemes (`customer`, `provider`).

No Android-only logic lives in the app hooks beyond normal `Platform.OS === "web"` guards.

## Security

- Do **not** set `EXPO_PUBLIC_SCREENSHOT_MODE` on **production** store builds unless you explicitly accept screenshot deep links in the wild.
- Demo accounts and staging URLs should not contain real PII in screenshots.

See **`SCREENSHOT_AUTOMATION_REPORT.md`** for approach, limitations, and submission-quality checklist.
