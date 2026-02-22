# EAS Build & Submit Setup Guide

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

```bash
# Development build (for testing with dev client)
eas build --profile development --platform all

# Preview build (internal distribution)
eas build --profile preview --platform all

# Production build (store submission)
eas build --profile production --platform all
```

## Step 5: Submit

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
| `EXPO_PUBLIC_ONESIGNAL_APP_ID` | OneSignal app ID |
| `EXPO_PUBLIC_AMPLITUDE_API_KEY` | Amplitude API key |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Mapbox access token |
| `SENTRY_AUTH_TOKEN` | Sentry auth token (for source maps) |

## OTA Updates

Once EAS project IDs are configured, OTA updates work automatically:

```bash
# Publish an update to the production channel
eas update --branch production --message "Bug fix v1.0.1"

# Publish to preview channel
eas update --branch preview --message "Testing new feature"
```
