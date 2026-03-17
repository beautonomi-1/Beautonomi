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
| **Provider: EAS iOS credentials** | **Next** | From `apps/provider`: `eas credentials --platform ios` → production → Build Credentials → finish provisioning profile. Step-by-step: `apps/provider/IOS_CREDENTIALS_SETUP.md` |
| Customer: Apple App ID + credentials | Pending | Register `com.beautonomi.customer` (or existing ID), then `eas credentials --platform ios` in `apps/customer` |
| Google Play key (if submitting) | Optional | `apps/provider/google-services-key.json`, `apps/customer/google-services-key.json` |
| Build | After credentials | Push to dev → merge to main, or run `eas build --profile production --platform all` |
| Submit to TestFlight / stores | After build | `eas submit --profile production --platform ios --latest` (and Android if key in place). **Step-by-step when builds run on push to main:** [IOS_RELEASE_SUBMIT.md](./IOS_RELEASE_SUBMIT.md) |

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

you must set up or validate iOS credentials **once** from your machine (interactive mode), **for each app** that fails:

- **Customer app** (Beautonomi, `com.beautonomi`): run from `apps/customer`.
- **Provider app** (Beautonomi Provider, `com.beautonomi.partner`): run from `apps/provider`.

```bash
cd apps/customer   # for customer iOS; use apps/provider for provider iOS
eas credentials --platform ios
```

1. Choose the **production** (or the profile you build with) build profile when prompted.
2. Select **Set up a new Distribution Certificate** (or **Use existing**, then validate).
3. Complete the flow for **each target** EAS lists. With OneSignal you will see two targets, e.g.:
   - **Beautonomi** (e.g. `com.beautonomi`) — main app
   - **OneSignalNotificationServiceExtension** (e.g. `com.beautonomi.OneSignalNotificationServiceExtension`) — push extension  
   They can share the same Distribution Certificate but need separate Provisioning Profiles. Follow the prompts for both so credentials are valid for non-interactive builds.
4. Re-run the build from CI or `eas build --profile production --platform ios --non-interactive`. Do the same for the other app (`apps/provider`) if you build both.

### Fixing OneSignal extension: "Provisioning profile doesn't support the App Group" (iOS)

If the **Xcode build** fails with:

- *Provisioning profile "... OneSignalNotificationServiceExtension ..." doesn't support the **group.com.beautonomi.onesignal** App Group*
- *Provisioning profile doesn't match the entitlements file's value for the **com.apple.security.application-groups** entitlement*

the **OneSignalNotificationServiceExtension** provisioning profile was created without the App Group capability. The main app and the extension both use `group.com.beautonomi.onesignal` (in `app.json` → `ios.entitlements`); the extension’s App ID and profile must include that capability.

**1. Apple Developer Portal**

1. Go to [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Open the App ID for the **extension** (e.g. `com.beautonomi.OneSignalNotificationServiceExtension` for customer; provider will use `com.beautonomi.partner.OneSignalNotificationServiceExtension`).
3. Ensure **App Groups** is enabled. Click **Configure** and add/select the group used by the app:
   - Customer: `group.com.beautonomi.onesignal`
   - Provider: `group.com.beautonomi.partner.onesignal`
4. Save the App ID.
5. **Provisioning Profiles**: Open **Profiles**, find the **Distribution** profile for the extension (e.g. the one named like "*[expo] com.beautonomi.OneSignalNotificationServiceExtension AppStore ..."). Either:
   - **Edit** the profile (if your portal allows editing capabilities) and ensure App Groups is included, then **Regenerate**, or
   - **Delete** that profile so EAS can create a new one that includes the App Group in the next step.

**2. EAS: refresh the extension’s provisioning profile**

From the app directory (e.g. `apps/customer`):

```bash
eas credentials --platform ios
```

1. Choose the **production** build profile.
2. When asked which target to manage, select **OneSignalNotificationServiceExtension**.
3. Under **Build Credentials**, choose to **Set up a new Provisioning Profile** (or remove the existing one and create new). EAS will create/fetch a profile that includes the capabilities of the App ID (including App Groups).
4. Finish the flow, then re-run the build:

   ```bash
   eas build --profile production --platform ios --non-interactive
   ```

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

### Fixing "Generating a new Keystore is not supported in --non-interactive mode" (Android)

If EAS Build fails with:

- **"Generating a new Keystore is not supported in --non-interactive mode"**

then Android credentials are not set up yet. EAS cannot create a keystore when running from CI/GitHub. You must set up the Android keystore **once** from your machine (interactive mode):

```bash
cd apps/customer   # or apps/provider
eas credentials --platform android
```

1. Choose the **production** (or the profile you build with) build profile when prompted.
2. When asked about the keystore, either:
   - **Generate a new keystore** — EAS will create one and store it on Expo’s servers (use this for new apps), or
   - **Use an existing keystore** — if you already have an upload keystore (e.g. from Play or from `generate-upload-keystore.ps1`), provide the path and passwords.
3. Complete the flow. After that, EAS will use the stored credentials for all future builds (including non-interactive/CI).

Do the same for the other app (`apps/provider`) if you build both. Then re-run the build from GitHub or `eas build --profile production --platform android --non-interactive`.

## Amplitude Guides & Surveys (optional)

The provider and customer apps use `@amplitude/plugin-engagement-react-native` when `guides_enabled` or `surveys_enabled` is set in `/api/public/analytics-config`. This plugin includes **native code**:

- **Development build required:** Use a development or preview build (`eas build --profile development` or `preview`) so the engagement native module is linked. Expo Go does not include custom native modules.
- **iOS:** After adding or updating the engagement plugin, run `cd ios && pod install` if you use a bare workflow or prebuild.
- **Preview deep links:** To preview guides/surveys on device, add the Amplitude URL scheme from your [Amplitude project settings](https://amplitude.com/docs/guides-and-surveys/guides-and-surveys-rn-sdk#setting-up-preview-in-xcode-ios) to each app (e.g. in `app.json` under `expo.ios` / `expo.android` or in the native projects). See `docs/analytics/AMPLITUDE_SURVEYS_GUIDES_PLATFORMS.md`.

## Step 4: Build

**Run all EAS commands from the app directory** (e.g. `apps/customer` or `apps/provider`), not from the monorepo root. Otherwise you get `Command "expo" not found` because the root `package.json` does not depend on Expo, or **"Experience with id '...' does not exist"** if a root-level config pointed EAS at the wrong project.

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

## Android: Aligning with existing Play Store apps (Flutter → Expo)

The customer and provider apps already exist on Google Play (Beautonomi, Beautonomi Partner). To ship Expo builds as **updates** to those same listings:

- **Package names** match: `com.beautonomi`, `com.beautonomi.partner` (in each app’s `app.json` → `expo.android.package`).
- **Version codes** are set so the next upload is accepted:
  - **Customer (Beautonomi):** `expo.android.versionCode: 4` (Play Production is at 3).
  - **Provider (Beautonomi Partner):** `expo.android.versionCode: 3` (Open testing is at 2).
- **Signing:** To update the existing apps, the Expo AAB must be signed with the **same** Android keystore used for the current Flutter builds. Configure EAS to use that keystore (e.g. `eas credentials --platform android` and supply the existing keystore path and passwords). Without the same key, Play will reject the upload as a different app.

**If you lost the Flutter upload keystore:** Google Play App Signing allows an "upload key reset". For **Beautonomi (customer)** you can generate a new upload keystore and PEM, then request the reset in Play Console:

1. Install Java JDK if needed (e.g. [Adoptium](https://adoptium.net)); ensure `keytool` is in PATH or set `JAVA_HOME`.
2. From repo root or `apps/customer`, run:
   ```powershell
   .\apps\customer\scripts\generate-upload-keystore.ps1
   ```
   This creates `apps/customer/upload-keystore.jks`, `upload_certificate.pem`, and `upload-keystore-credentials.txt` (password; gitignored).
3. In Play Console → Beautonomi → **Release** → **Setup** → **App signing** → **Request upload key reset** → choose "I lost my upload key" → upload the generated **upload_certificate.pem**.
4. After Google approves, run `eas credentials --platform android` in `apps/customer`, choose "Use existing keystore", and point to `upload-keystore.jks` using the password from `upload-keystore-credentials.txt`.

Repeat the same process for **Beautonomi Partner (provider)** in its own App signing page; use a separate keystore (run a similar script from `apps/provider` or generate a second keystore with a different output path).

Bump `versionCode` in each app’s `app.json` whenever you need a higher code than what’s currently on the store.

**Play Console recommendations** (edge-to-edge deprecated, 16 KB alignment, technical quality): see [GOOGLE_PLAY_RELEASE_NOTES.md](./GOOGLE_PLAY_RELEASE_NOTES.md).

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
