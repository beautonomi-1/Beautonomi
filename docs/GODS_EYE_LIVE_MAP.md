# Gods Eye Live Map

Superadmin-only live map for operational and dispute-resolution use: provider locations, at-home and at-salon bookings, arrival detection, and audit logging.

## Access and security

- **Superadmin only**: All map and tracking APIs and the Live Map tab are gated by `requireRoleInApi(["superadmin"])`. RLS on `provider_location_events`, `booking_tracking_state`, and `gods_eye_audit_log` restricts access accordingly.
- **Audit**: Every map view and every “open booking” tracking view is logged via `POST /api/admin/gods-eye/audit`. Use for compliance and dispute evidence.

## Privacy

- **Customer location**: Only shown when there is an **active at-home booking** (confirmed/in_progress). The position shown is the **booking address** (geocoded), not real-time device GPS.
- **Provider location**: From pings sent only when the provider app/portal sends location **for an active at-home booking** (or optionally without booking for “last known”).
- **Privacy mode**: In the Live Map UI, “Privacy mode (fuzz)” applies ~200m coordinate fuzz so the overview does not show exact addresses until a booking is selected.
- **Retention**: Configurable via `gods_eye_tracking_config` (`retention_days_raw_pings`). Raw pings can be purged; arrival evidence (timestamp, distance at arrival) is stored in `booking_tracking_state`.

## Data model

- **provider_location_events**: One row per location ping (provider_id, user_id, optional booking_id, lat/lng, accuracy, speed, heading, source, recorded_at). Indexed by provider and booking for fast “last known” and track history.
- **booking_tracking_state**: One row per booking. Holds tracking_enabled, provider last position, customer target (from booking address), arrived_at_target, arrived_at, arrived_distance_m, last_distance_to_target_m, status (en_route/arrived/in_service/completed). Updated by the provider ping API when pings include a booking_id.
- **gods_eye_audit_log**: Admin user, action (view_map, open_booking, export, toggle_filter), optional booking_id, meta (filters, etc.), created_at.
- **gods_eye_tracking_config**: Key-value config (key `default`): tracking_enabled_global, tracking_ping_interval_seconds, tracking_arrival_radius_meters, retention_days_raw_pings, privacy_fuzz_meters_default, map_default_zoom, map_default_center.

## Arrival detection

- When a provider sends a ping with `booking_id`, the server:
  - Inserts into `provider_location_events`.
  - Resolves the booking’s target (address_latitude, address_longitude).
  - Computes distance (haversine) from ping to target.
  - Upserts `booking_tracking_state`: updates provider_last_*, last_distance_to_target_m.
  - If distance ≤ `tracking_arrival_radius_meters` (default 100m) and not already arrived: sets arrived_at_target=true, arrived_at=now(), arrived_distance_m=distance, status=arrived.
- Dispute evidence: use `GET /api/admin/gods-eye/booking/[id]/track` for tracking_state (arrived_at, arrived_distance_m) and last N location_events around arrival.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/gods-eye/map-state` | Provider markers, at-home bookings (target + tracking), at-salon bookings, summary. Query: location_type, booking_status, provider_status, time_window_mins. |
| GET | `/api/admin/gods-eye/booking/[id]/track` | Tracking state, last N location events, route line (provider → target). |
| POST | `/api/admin/gods-eye/audit` | Log view_map, open_booking, export, toggle_filter. Body: action, booking_id?, meta?. |
| POST | `/api/provider/location/ping` | Provider (owner/staff) sends location. Body: booking_id?, lat, lng, accuracy_m?, speed_mps?, heading_deg?, recorded_at?, source?. If booking_id present, must be provider’s active at_home booking. |
| POST | `/api/admin/gods-eye/retention` | Superadmin. Runs retention purge; returns `{ deleted: number }`. |

## Provider ping ingestion

- **POST /api/provider/location/ping**: Requires provider_owner or provider_staff. Validates booking ownership and at_home + active status when booking_id is set. Inserts `provider_location_events` and updates `booking_tracking_state` (and arrival) as above.
- **Mobile app**: Call this API when the provider has an active at-home booking and has opted in (e.g. “Share location for this booking”). Throttle to configurable interval (e.g. 15s foreground). Stub behind a feature flag if the app does not implement yet.

### Provider app integration (Expo)

- **Auth**: Send the Supabase session access token as `Authorization: Bearer <access_token>` (same as other provider API calls).
- **URL**: `POST {APP_URL}/api/provider/location/ping`.
- **Body (JSON)**: `lat`, `lng` (required); `booking_id` (UUID, optional, for active at-home booking); optional: `accuracy_m`, `speed_mps`, `heading_deg`, `recorded_at` (ISO), `source` (`foreground` | `background` | `manual` | `system`).
- **When**: Only when user opted in; for at-home confirmed/in_progress booking include `booking_id` and throttle to config interval (e.g. 15s). Use `expo-location` for coordinates; call the API with the app's authenticated client.

## UI (Live Map tab)

- **Location**: Superadmin → Gods Eye → “Live Map” tab.
- **Behaviour**: Polls `map-state` every 10s. Mapbox map shows:
  - Blue circles: provider last known position.
  - Gray circles: at-home customer targets (booking address).
  - Purple circles: at-salon (salon location).
  - Lines: provider last position → customer target (green when arrived, blue when en route).
- **Summary cards**: Active providers, at-home count, en route, arrived, at salon.
- **Tracking config**: Card shows arrival radius and retention; gear icon opens dialog to edit (PATCH config).
- **Privacy mode**: Toggle to fuzz coordinates until a booking is selected in the drawer.
- **Drawer**: Click a booking (target, salon, or provider with active booking) to open the right drawer; “Load track & evidence” fetches `/booking/[id]/track` and logs open_booking. “Export evidence” (download icon) fetches track data, logs audit action `export`, and downloads a JSON file (`gods-eye-evidence-{booking_id}.json`) with tracking_state, location_events, and route_line for dispute evidence.

## Configuration

- **API**: GET/PATCH `/api/admin/gods-eye/config` read and update the default tracking config (superadmin only). PATCH merges provided fields into the stored value.
- **Live Map UI**: A "Tracking config" card in the Live Map left sidebar shows arrival radius and retention; the gear icon opens a dialog to edit them (saved via PATCH config).
- **Direct DB**: Edit `gods_eye_tracking_config` (key `default`) for:
  - tracking_arrival_radius_meters (default 100)
  - retention_days_raw_pings (default 30)
  - privacy_fuzz_meters_default (default 200)
  - map_default_center / map_default_zoom
- Optional: add a feature flag (e.g. `gods_eye_live_map_enabled`) and hide the Live Map tab or disable ping ingestion when off.

## Feature flag

- **gods_eye_live_map**: When enabled (default), the "Live Map" tab is shown in Gods Eye. Superadmins can disable it in Admin → Feature Flags to hide the tab without redeploying. The map-state and track APIs remain available; only the tab visibility is gated.

## Retention purge

- **Function**: `purge_old_provider_location_events()` (migration 298) deletes rows in `provider_location_events` where `recorded_at` is older than `retention_days_raw_pings` from config (default 30).
- **Run manually**: `POST /api/admin/gods-eye/retention` (superadmin) calls the function and returns `{ deleted: number }`.
- **Cron**: Schedule that POST with superadmin auth (e.g. daily) or run the SQL function via pg_cron / Edge Function.

## Implementation notes

- **Existing table**: `provider_location_updates` (booking-scoped) remains; `provider_location_events` is the Gods Eye operational table with optional booking_id and source.
- **Realtime**: MVP uses polling; Supabase Realtime on `provider_location_events` can be added later for live updates without refresh.
- **Clustering**: Map uses circle layers; Mapbox cluster layer can be added for dense regions.
- **Export / disputes**: “Open dispute evidence” can export tracking_state + location_events (e.g. JSON) for a booking; audit log already records open_booking.
