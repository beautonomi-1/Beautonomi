# Maintenance & Coming Soon

Per-scope maintenance or coming-soon pages with CMS control, optional countdown, and “notify me” sign-ups.

## Scopes

| Scope | Where it applies |
|-------|-------------------|
| `public_site` | Customer-facing marketing/booking web (not `/provider`, `/admin`, `/account-settings`, etc.) |
| `provider_web` | Provider portal at `/provider` |
| `customer_app` | Customer Expo app (after entering the app) |
| `provider_app` | Provider Expo app (after login) |

## Admin

- **Screen:** Admin → Control Plane → **Maintenance & Coming Soon**
- **Per scope:** Enable toggle, title, message, CTA label, optional countdown end (UTC) and countdown label.
- **Preview:** Each section has a **Preview** link that opens the right surface with maintenance on (web: `?maintenance_preview=1`; app scopes: `/maintenance-preview?scope=...`).
- **Sign-ups:** **View notify sign-ups** lists emails collected from the “Notify me” CTA; filter by scope and export CSV.

## Storage

- Config: `platform_settings.settings.maintenance[scope]` (no new table).
- Sign-ups: `maintenance_notify_emails` (one row per email per scope; duplicate submissions return success).

## APIs

- **GET** `/api/public/maintenance?scope=...` — Public; returns `{ enabled, title, message, cta_label?, countdown_end_at?, countdown_label? }`. Cached 60s.
- **POST** `/api/public/maintenance-notify` — Body: `{ email, scope? }`. Idempotent per (email, scope).
- **GET/PATCH** `/api/admin/maintenance` — Superadmin; full config get/update.
- **GET** `/api/admin/maintenance-notify?scope=...&limit=...` — Superadmin; list sign-ups for export.

## Web behaviour

- **MaintenanceGate** in `ClientAppShell` checks pathname and `?maintenance_preview=1`; if maintenance is enabled (or preview), it renders the full-page maintenance view instead of children.
- Routes under `/admin`, `/account-settings`, `/portal`, `/auth`, `/api`, `/maintenance-preview` are never gated.
- When **`public_site`** maintenance is on, partner acquisition and auth stay available (path list: `@beautonomi/maintenance-paths` → `resolveWebMaintenanceFetch` in `maintenance-web-path-scope.ts`). Subpaths of those prefixes are not gated.
- When **`provider_web`** maintenance is on, behavior depends on **Keep onboarding & checkout available** (stored as `allow_partner_funnel`, default true): when **on**, funnel paths in `provider-web-maintenance-exempt.ts` stay reachable; when **off**, the entire `/provider` tree is gated (full provider-web outage).

## Mobile apps

- Customer and provider Expo apps each have a **MaintenanceGate** in their `(app)` layout. On load they call the public maintenance API for `customer_app` / `provider_app`; if enabled, they show a full-screen maintenance view (title, message, countdown, notify form) instead of the app.
