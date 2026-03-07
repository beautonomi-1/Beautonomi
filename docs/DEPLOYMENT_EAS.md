# EAS Build & Submit Setup Guide

## Current plan checklist

Use this to continue from where you left off.

| Step | Status | Action |
|------|--------|--------|
| EAS CLI + login | Done | — |
| EAS secrets (production) | Verify | expo.dev → provider + customer: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_URL`, `EXPO_PUBLIC_SENTRY_DSN` |
| Provider: bundle ID | Done | `com.beautonomi.partner` (iOS + Android) in `apps/provider/app.json` |
| Apple: App ID com.beautonomi.partner | Done | Identifiers → App ID exists |
| Apple: App Group | Done | `group.com.beautonomi.partner.onesignal` created and linked to App ID |
| OneSignal: APNs + App ID | Done | .p8 key uploaded; App ID `2a9cb375-343c-43d7-83ab-955654811406`; superadmin must return this via `/api/public/third-party-config?service=onesignal` |
| **Provider: EAS iOS credentials** | **Next** | From `apps/provider`: `eas credentials --platform ios` → production → Build Credentials → finish provisioning profile |
| Customer: Apple App ID + credentials | Pending | Register `com.beautonomi.customer` (or existing ID), then `eas credentials --platform ios` in `apps/customer` |
| Google Play key (if submitting) | Optional | `apps/provider/google-services-key.json`, `apps/customer/google-services-key.json` |
| Build | After credentials | Push to dev → merge to main, or run `eas build --profile production --platform all` |
| Submit to TestFlight / stores | After build | `eas submit --profile production --platform ios --latest` (and Android if key in place) |

## Prerequisites

1. Install EAS CLI: `npm install -g eas-cli`
2. Log in to Expo: `eas login`
3. Create Expo projects for each app

## Step 1: Initialize EAS Projects

Run in each app directory:

```bash
# Customer app
cd apps/customer
eas project:init
# This will create/link to an Expo project and update app.json with the real projectId

# Provider app
cd apps/provider
eas project:init
```

After running `eas project:init`, update the following in each app's `app.json`:

- `expo.updates.url` — Replace `REPLACE_WITH_*_PROJECT_ID` with the actual project ID
- `expo.extra.eas.projectId` — Same project ID

## Step 2: Configure Apple Credentials

### iOS export compliance

Both apps declare `ITSAppUsesNonExemptEncryption: false` in `ios.infoPlist` (in `app.json`). This is required for App Store Connect and EAS Build. Use `false` when the app only uses standard HTTPS/TLS (no custom encryption).

### Fixing "Credentials are not set up" / "Distribution Certificate is not validated" (iOS)

If EAS Build fails with:

- **"Distribution Certificate is not validated for non-interactive builds"**
- **"Credentials are not set up. Run this command again in interactive mode."**

you must set up or validate iOS credentials **once** from your machine (interactive mode):

```bash
cd apps/customer   # or apps/provider
eas credentials --platform ios
```

1. Choose the **production** (or the profile you build with) build profile when prompted.
2. Select **Set up a new Distribution Certificate** (or **Use existing**, then validate).
3. Complete the flow: EAS will use your Apple ID and create/register the certificate so **remote** (non-interactive) builds can use it.

Then re-run the build (e.g. from CI or `eas build --profile production --platform ios --non-interactive`). Do the same for the other app (`apps/provider`) if you build both.

In each app's `eas.json`, update the `submit.production.ios` section:

| Field | Where to Find |
|-------|--------------|
| `appleId` | Your Apple ID email (developer.apple.com) |
| `ascAppId` | App Store Connect > App > General > App Information > Apple ID (numeric) |
| `appleTeamId` | developer.apple.com > Membership > Team ID |

## Step 3: Configure Google Play Credentials

1. **Create a Google Play Service Account**:
   - Go to Google Play Console > Setup > API access
   - Create a new service account
   - Download the JSON key file

2. **Place the key file**:
   - Save as `apps/customer/google-services-key.json`
   - Save as `apps/provider/google-services-key.json`
   - These are already in `.gitignore`

3. The `serviceAccountKeyPath` in `eas.json` points to `./google-services-key.json`

## Amplitude Guides & Surveys (optional)

The provider and customer apps use `@amplitude/plugin-engagement-react-native` when `guides_enabled` or `surveys_enabled` is set in `/api/public/analytics-config`. This plugin includes **native code**:

- **Development build required:** Use a development or preview build (`eas build --profile development` or `preview`) so the engagement native module is linked. Expo Go does not include custom native modules.
- **iOS:** After adding or updating the engagement plugin, run `cd ios && pod install` if you use a bare workflow or prebuild.
- **Preview deep links:** To preview guides/surveys on device, add the Amplitude URL scheme from your [Amplitude project settings](https://amplitude.com/docs/guides-and-surveys/guides-and-surveys-rn-sdk#setting-up-preview-in-xcode-ios) to each app (e.g. in `app.json` under `expo.ios` / `expo.android` or in the native projects). See `docs/analytics/AMPLITUDE_SURVEYS_GUIDES_PLATFORMS.md`.

## Step 4: Build

**Run all EAS commands from the app directory** (e.g. `apps/customer` or `apps/provider`), not from the monorepo root. Otherwise you get `Command "expo" not found` because the root `package.json` does not depend on Expo.

```bash
cd apps/customer   # or apps/provider
# Development build (for testing with dev client)
eas build --profile development --platform all

# Preview build (internal distribution)
eas build --profile preview --platform all

# Production build (store submission)
eas build --profile production --platform all
```

From the monorepo root you can use: `pnpm run build:customer:ios`, `pnpm run build:customer:android`, `pnpm run build:provider:ios`, `pnpm run build:provider:android`.

## Step 5: Submit

From the app directory (`apps/customer` or `apps/provider`):

```bash
# Submit to App Store and Google Play
eas submit --profile production --platform all
```

## Environment Variables

Set these in EAS secrets at [expo.dev](https://expo.dev):

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_APP_URL` | Backend URL (e.g. https://beautonomi.com); apps fetch OneSignal/Amplitude/Mapbox from API at runtime |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional. Sentry DSN for runtime. |
| `SENTRY_AUTH_TOKEN` | Optional. Sentry auth token for uploading source maps on build. |

OneSignal, Amplitude, and Mapbox are managed in the **superadmin portal** and served to apps via `/api/public/third-party-config` and `/api/public/analytics-config`; do not set them in EAS secrets.

**Sentry:** The `@sentry/react-native` **Expo config plugin** is not used (removed from `app.json` plugins). Its native Xcode phase runs `require.resolve('@sentry/cli/package.json')` from the `ios/` directory, which fails on EAS with pnpm. The **JS SDK** (`@sentry/react-native` package and `src/lib/sentry.ts`) is still used for error reporting; only the native build-phase integration (debug symbol upload, source map upload from Xcode) is disabled. Production builds have `SENTRY_DISABLE_AUTO_UPLOAD=true` in `eas.json`. To re-enable native uploads you would need to fix the CLI resolution (e.g. add `@sentry/cli` as a direct app dependency and ensure the plugin’s script can resolve it).

## Production build checklist

For a full pre-deploy checklist (web + mobile), see [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md).

Before running a production EAS build:

1. **EAS secrets** (expo.dev → project → Secrets): Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_URL`, and optionally `EXPO_PUBLIC_SENTRY_DSN` and `EXPO_PUBLIC_ONESIGNAL_APP_ID` for each app (customer and provider).
2. **OneSignal mode**: The production build profile in `eas.json` sets `APP_ENV=production`. `app.config.js` uses this to set the OneSignal Expo plugin to `mode: "production"` (APNs production entitlement). No manual change needed when building with `--profile production`.
3. **Pre-release checks** (from repo root):
   - `pnpm run release:check` — runs typecheck, lint, and test (no full build).
   - `pnpm run prepare:production` — runs typecheck, lint, test, and full build.
   - From each app: `npx expo-doctor` to catch config/dependency issues.
4. **Build**: From app dir, `eas build --profile production --platform ios` (and/or `android`), or from root: `pnpm run build:customer:ios`, etc.

## OTA Updates

Once EAS project IDs are configured, OTA updates work automatically:

```bash
# Publish an update to the production channel
eas update --branch production --message "Bug fix v1.0.1"

# Publish to preview channel
eas update --branch preview --message "Testing new feature"
```
