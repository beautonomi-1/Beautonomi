# On-Demand UX Module

On-demand UX covers ringtone and waiting screen behaviour for provider-side flows. It is controlled by the **on_demand** module config and feature flags. No full matching logic is required for the initial implementation.

## Storage

- **Bucket**: `app-assets` (created in migration `255_storage_app_assets_bucket.sql`).
- **Path convention**: `ux/ringtones/default.mp3` (single file; path is set per environment in `ringtone_asset_path` if you need different files).
- **Access**: Bucket is private. Use a signed-URL API route to serve ringtone files to clients; do not expose the bucket publicly.

## Module config (env-scoped)

**Table**: `on_demand_module_config` (one row per environment)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | boolean | false | Master switch for on-demand UX |
| ringtone_asset_path | text | null | Storage path, e.g. `ux/ringtones/default.mp3` |
| ring_duration_seconds | int | 20 | How long to play the ringtone |
| ring_repeat | boolean | true | Whether to loop the ringtone |
| waiting_screen_timeout_seconds | int | 45 | Timeout for the waiting screen |
| provider_accept_window_seconds | int | 30 | Window for provider to accept |
| ui_copy | jsonb | {} | Copy for UI: title, message, etc. |

## Client behaviour

- **Config**: Clients (web, provider app, customer app) read on_demand config from the **config bundle** (`GET /api/public/config-bundle`) or from `useModuleConfig('on_demand')` when using the ConfigBundleProvider.
- **Web**: `ConfigBundleProvider` in root layout; full waiting page at `apps/web/src/app/book/on-demand/waiting/page.tsx` (requestId in query), `WaitingScreen` and `WaitingIllustration` in `apps/web/src/components/on-demand/`; ringtone in `apps/web/src/lib/on-demand/ringtone.ts`.
- **Provider Expo**: `ConfigBundleProvider` in root layout; **incoming request** screen at `apps/provider/app/(app)/on-demand/incoming/[id].tsx` (Accept/Decline; plays ringtone when screen shows a requested request, stops on accept/decline/expiry); simple `WaitingScreen` in `apps/provider/src/components/on-demand/`; ringtone in `apps/provider/src/lib/on-demand/ringtone.ts`. **Front Desk** waiting room (`(tabs)/more/waiting-room.tsx`) also uses ringtone when waiting count increases (separate from on-demand incoming).
- **Customer Expo**: `ConfigBundleProvider` in root layout; full waiting page at `apps/customer/app/(app)/on-demand/waiting.tsx`; simple `WaitingScreen` in `apps/customer/src/components/on-demand/`; ringtone stub in `apps/customer/src/lib/on-demand/ringtone.ts`.
- **Waiting screen**: All platforms use the same ui_copy keys: `waiting_title`, `waiting_headline`, `waiting_provider_message` (with `{provider_name}`), `waiting_help_url`, `waiting_timer_label`, `waiting_cancel_cta`. Full customer flow shows request ID, illustration/animation, countdown and cancel. Simple components fall back to `title`/`message` if present.
- **Ringtone** (provider-side only; customer has no ringtone):
  - **Signed URL**: `GET /api/public/on-demand/ringtone-url?environment=production` returns `{ signed_url, expires_in_seconds, path }`. Query params: `environment` (production|staging|development), optional `expires_in` (seconds, 60–3600, default 300).
  - **Web provider**: `OnDemandIncomingOverlay` plays ringtone when a new on-demand request appears; stops on accept/decline/close.
  - **Provider Expo**: Incoming screen `on-demand/incoming/[id]` plays ringtone when showing a `requested` request; stops on accept, decline, or expiry. Front Desk waiting room plays ringtone when waiting count increases (separate flow). Uses `expo-av` via `playRingtone()` in `apps/provider/src/lib/on-demand/ringtone.ts`.
  - **Customer**: No ringtone; customer sees waiting screen with illustration and countdown only.

## Provider vs customer screens

| | Customer | Provider |
|---|----------|----------|
| **Screen** | Waiting: request ID, illustration, headline, “We’ll confirm… {provider_name}”, countdown, Cancel | Incoming: request details, Accept / Decline, expiry |
| **Ringtone** | No | Yes (incoming request; also Front Desk when waiting count increases) |
| **Actions** | Cancel request | Accept (creates booking) or Decline |

## Feature flag

Gate the full on-demand flow (waiting screen + ringtone) with a feature flag so that it can be rolled out per platform/environment without deploying.

## Summary

- **Storage path**: `app-assets` → `ux/ringtones/default.mp3` (or path set in `ringtone_asset_path`).
- **Durations**: ring_duration_seconds, waiting_screen_timeout_seconds, provider_accept_window_seconds are all configurable per environment.
- **UI copy**: Stored in `ui_copy` JSON; use for title, message, and any other copy on the waiting screen.
- **Post-acceptance (customer)**: After provider accepts, customer sees booking detail with Booking #, acceptance strip, and (on customer app) Tracking | Receipt | Details tabs. For at-home bookings, ETA and “Provider en route” / “Provider arrived” are shown when the backend provides them (migration 290, start-journey/arrive/location). See `docs/ON_DEMAND_ACCEPTANCE.md` (Post-acceptance UX section).
