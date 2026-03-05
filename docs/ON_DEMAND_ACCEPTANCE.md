# On-Demand Accept / Decline (Uber-style)

This feature adds a second on-demand mode: **provider acceptance required**. The customer submits a request; the provider gets an incoming alert and can Accept or Decline within a time window. The existing “waiting room ringtone” module is unchanged.

## Two modes

| Mode | Description |
|------|-------------|
| **Waiting room** (existing) | Client checked in / in waiting room → provider list shows count → ringtone when count increases. No accept step. |
| **Accept required** (new) | Customer creates an on-demand **request** → provider gets **incoming request** → Accept/Decline within window → customer sees accepted/declined/expired in realtime. |

## Data model

### Table: `public.on_demand_requests`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| provider_id | uuid | FK providers(id) |
| customer_id | uuid | FK users(id) |
| booking_id | uuid | FK bookings(id), set when accepted and booking created |
| status | text | `requested` \| `accepted` \| `declined` \| `cancelled` \| `expired` |
| requested_at | timestamptz | When request was created |
| accepted_at | timestamptz | When provider accepted (if any) |
| declined_at | timestamptz | When provider declined (if any) |
| cancelled_at | timestamptz | When customer cancelled (if any) |
| expires_at | timestamptz | requested_at + provider_accept_window_seconds |
| request_payload | jsonb | Services, location, notes, pricing snapshot (booking-draft-like) |
| provider_response_payload | jsonb | Optional decline reason, staff assigned, etc. |
| idempotency_key | text | Unique; used for idempotent create |

**Indexes:** `(provider_id, status, expires_at)`, `(customer_id, status, requested_at DESC)`.

**Realtime:** Table is added to `supabase_realtime` publication so customer and provider get live updates.

## RLS

- **Customer:** SELECT/INSERT own rows; UPDATE only to cancel when `status='requested'` and `now() < expires_at`.
- **Provider:** SELECT rows for their provider (owner or staff); UPDATE only to accept/decline when `status='requested'` and not expired.
- **Superadmin:** Full access.

## API endpoints

### Customer (auth required)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/me/on-demand/requests | Create request. Body: `provider_id`, `request_payload`, optional `idempotency_key`. Idempotent by key. |
| GET | /api/me/on-demand/requests/[id] | Get one request (own only). |
| POST | /api/me/on-demand/requests/[id]/cancel | Cancel if still requested. Returns 409 if already handled/expired. |

### Provider (auth required, provider role)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/provider/on-demand/requests | List active: `status='requested'` and `now() < expires_at`. |
| GET | /api/provider/on-demand/requests/[id] | Get one request (own provider only). |
| POST | /api/provider/on-demand/requests/[id]/accept | Atomic accept; creates booking from request_payload, sets booking_id, notifies customer. Returns 409 if already handled/expired. |
| POST | /api/provider/on-demand/requests/[id]/decline | Atomic decline; optional body `{ reason }`; notifies customer. Returns 409 if already handled/expired. |

Responses use existing `{ data, error }` format.

## Realtime

- **Customer:** Subscribe to `on_demand_requests` with filter `id=eq.<request_id>` to see status changes (accepted/declined/cancelled/expired).
- **Provider:** Subscribe to `on_demand_requests` with filter `provider_id=eq.<provider_id>` to see new requests.

Apps should also use fallback polling (e.g. every 10–15s) if realtime is unavailable.

## Config and feature flags

- **Module config:** Existing `on_demand_module_config`: `enabled`, `ringtone_asset_path`, `ring_duration_seconds`, `ring_repeat`, `provider_accept_window_seconds`, `waiting_screen_timeout_seconds`, `ui_copy` (JSON).
- **ui_copy keys (optional):** `waiting_title`, `waiting_headline`, `waiting_provider_message` (use `{provider_name}` placeholder), `waiting_help_url`, `waiting_timer_label`, `waiting_cancel_cta`, `accepted_title`, `accepted_subtitle`, `declined_title`, `declined_subtitle`, `expired_title`, `expired_subtitle`, `provider_incoming_title`, `provider_incoming_subtitle`, `provider_accept_cta`, `provider_decline_cta`.
- **Feature flags (in `feature_flags`):**  
  - `on_demand_accept_enabled` — global  
  - `on_demand_accept_customer_enabled` — customer app  
  - `on_demand_accept_provider_enabled` — provider app/portal  

Config bundle and flags are read at app startup and refreshed periodically (e.g. every 10 minutes). No app release needed to toggle.

## UX states

- **Customer:** Requesting → Waiting (timer + loader) → Accepted (navigate to booking or result) or Declined/Expired/Cancelled (result screen with CTAs).
- **Provider:** Idle → Incoming (ring + full-screen overlay + countdown) → Accept (stop ring, navigate to booking) or Decline (stop ring, toast) or Timeout (stop ring, close).

## Concurrency

Accept, decline, and cancel use a single `UPDATE ... WHERE status='requested' AND now() < expires_at ... RETURNING *`. If 0 rows are updated, the API returns 409 `ALREADY_HANDLED_OR_EXPIRED`.

## Expiring requests

- **Client-side:** Treat as expired when `now() >= expires_at` (timer reaches 0).
- **Server-side (optional):** Call `GET /api/cron/expire-on-demand-requests` (with `Authorization: Bearer <CRON_SECRET>`) every minute to set `status='expired'` for rows where `status='requested'` and `expires_at < now()`. This lets realtime subscribers see the status change. In this repo, `apps/web/vercel.json` includes a cron that runs this route every minute (`* * * * *`).

## Ringtone

Reuses existing `GET /api/public/on-demand/ringtone-url?environment=...` (signed URL). No secrets in client.

## Cross-platform wiring checklist

| Platform | Flow | Entry | API / Realtime | Redirects / Next screen |
|----------|------|--------|----------------|-------------------------|
| **Customer (Expo)** | Create request | `book-checkout` → "Request now" | `POST /api/me/on-demand/requests` → `requestId` | → `(app)/on-demand/waiting?requestId` |
| | Waiting | `(app)/on-demand/waiting` | `GET /api/me/on-demand/requests/[id]` (returns `provider_name`), Realtime `on_demand_requests` filter `id`, poll 12s | Accept+booking_id → `(app)/booking-detail?id=booking_id`; else accept → `(app)/on-demand/result?status=accepted`; declined/expired/cancelled → `(app)/on-demand/result?status=...` |
| | Result | `(app)/on-demand/result` | — | "View my bookings" → `(app)/(tabs)/bookings`; "Back to home" → `(app)/(tabs)` |
| | Post-accept | `(app)/booking-detail` | `GET /api/me/bookings/[id]`, Realtime `bookings` | Booking # in header, acceptance strip, Tracking/Receipt/Details tabs, Help from `ui_copy.waiting_help_url` |
| **Web (customer)** | Waiting | `/book/on-demand/waiting?requestId=` | `GET /api/me/on-demand/requests/[id]`, poll 12s | Accept+booking_id → `/account-settings/bookings/[id]`; else → `/book/on-demand/result?status=...&requestId=` |
| | Result | `/book/on-demand/result?status=&requestId=` | — | "View my bookings" → `/account-settings/bookings`; "Back to home" → `/` |
| | Post-accept | `/account-settings/bookings/[id]` | `GET /api/me/bookings/[id]` | Booking # in title, acceptance strip for confirmed/pending/started, Help from `ui_copy.waiting_help_url` |
| **Provider (Expo)** | Incoming | Realtime INSERT `on_demand_requests` filter `provider_id` or poll `/api/provider/on-demand/requests` | Navigate to `(app)/on-demand/incoming/[id]` | Ringtone plays when screen shows requested request; stops on accept/decline/expiry |
| | Accept/Decline | `(app)/on-demand/incoming/[id]` | `GET /api/provider/on-demand/requests/[id]`, `POST .../accept`, `POST .../decline` | Accept → `(app)/(tabs)/more/bookings/[booking_id]` or back; Decline → back |
| **Web (provider)** | Incoming | `OnDemandIncomingOverlay` polls `/api/provider/on-demand/requests` | Ringtone on new request; accept → `POST .../accept` → `window.location.href=/provider/bookings/[booking_id]`; decline → `POST .../decline`, close overlay |

**Config:** All customer waiting/result and provider incoming use `useModuleConfig('on_demand')` (or web `ConfigBundleProvider`). Same `ui_copy` keys across platforms: `waiting_title`, `waiting_headline`, `waiting_provider_message`, `waiting_help_url`, `waiting_timer_label`, `waiting_cancel_cta`, accepted/declined/expired titles and subtitles.
