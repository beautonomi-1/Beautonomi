# On-Demand UX Module

On-demand UX covers ringtone and waiting screen behaviour for provider-side flows. It is controlled by the **on_demand** module config and feature flags. No full matching logic is required for the initial implementation.

## Storage

- **Bucket**: `app-assets` (created in migration `255_storage_app_assets_bucket.sql`).
- **Path convention**: `ux/ringtones/<environment>/default.mp3`  
  Example: `ux/ringtones/production/default.mp3`, `ux/ringtones/staging/default.mp3`.
- **Access**: Bucket is private. Use a sgned-URL API route to serve ringtone files to clients; do not expose the bucket publicly.

## Module config (env-scoped)

**Table**: `on_demand_module_config` (one row per environment)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | boolean | false | Master switch for on-demand UX |
| ringtone_asset_path | text | null | Storage path, e.g. `ux/ringtones/production/default.mp3` |
| ring_duration_seconds | int | 20 | How long to play the ringtone |
| ring_repeat | boolean | true | Whether to loop the ringtone |
| waiting_screen_timeout_seconds | int | 45 | Timeout for the waiting screen |
| provider_accept_window_seconds | int | 30 | Window for provider to accept |
| ui_copy | jsonb | {} | Copy for UI: title, message, etc. |

## Client behaviour

- **Config**: Clients (web, provider app, customer app) read on_demand config from the **config bundle** (`GET /api/public/config-bundle`) or from `useModuleConfig('on_demand')` when using the ConfigBundleProvider.
- **Web**: `ConfigBundleProvider` in root layout; `apps/web/src/components/on-demand/WaitingScreen.tsx`; ringtone stub in `apps/web/src/lib/on-demand/ringtone.ts`.
- **Provider Expo**: `ConfigBundleProvider` in root layout; `apps/provider/src/components/on-demand/WaitingScreen.tsx`; ringtone stub in `apps/provider/src/lib/on-demand/ringtone.ts`.
- **Customer Expo**: `ConfigBundleProvider` in root layout; `apps/customer/src/components/on-demand/WaitingScreen.tsx`; ringtone stub in `apps/customer/src/lib/on-demand/ringtone.ts`.
- **Waiting screen**: A simple waiting screen component displays `ui_copy.title`, `ui_copy.message`, and respects `waiting_screen_timeout_seconds`.
- **Ringtone**: Behind the same feature flag / module toggle:
  - **Signed URL**: `GET /api/public/on-demand/ringtone-url?environment=production` returns `{ signed_url, expires_in_seconds, path }`. Query params: `environment` (production|staging|development), optional `expires_in` (seconds, 60–3600, default 300).
  - **Web**: Call the ringtone-url API, then use `new Audio(signedUrl).play()` with repeat and timeout; optional `playRingtone()` helper in `apps/web/src/lib/on-demand/ringtone.ts`.
  - **Expo (provider/customer)**: Call the ringtone-url API, then use `expo-av` to play for `ring_duration_seconds`, stop on timeout. Do not auto-switch into dev-client mode; keep optional.

## Feature flag

Gate the full on-demand flow (waiting screen + ringtone) with a feature flag so that it can be rolled out per platform/environment without deploying.

## Summary

- **Storage path**: `app-assets` → `ux/ringtones/<environment>/default.mp3` (or path set in `ringtone_asset_path`).
- **Durations**: ring_duration_seconds, waiting_screen_timeout_seconds, provider_accept_window_seconds are all configurable per environment.
- **UI copy**: Stored in `ui_copy` JSON; use for title, message, and any other copy on the waiting screen.
