# Control Plane

The Control Plane is the Superadmin-managed layer for feature flags, integrations, and module configs. It **orchestrates** existing config sources; it does not replace them.

## Existing config sources (unchanged)

- **Amplitude**: `GET /api/public/analytics-config?environment=...` → `amplitude_integration_config`
- **Third-party**: `GET /api/public/third-party-config?service=onesignal|mapbox` → `platform_settings.settings`
- **Branding**: `GET /api/public/settings/branding` → `platform_settings.settings.branding`
- **Feature flags**: `GET /api/feature-flags/check?key=...`, `POST /api/feature-flags/check`, `GET /api/provider/feature-flags`, `GET/POST/PATCH/DELETE /api/admin/feature-flags`

All of these remain in place. The Control Plane adds a single **config bundle** and admin UI.

## Config bundle

**Endpoint**: `GET /api/public/config-bundle`

**Query params**: `platform` (web|customer|provider), `environment` (production|staging|development), optional `app_version`, `user_id`, `role`, `provider_id`

**Response**: One JSON object with:

- `meta`: env, platform, version, fetched_at
- `amplitude`: safe analytics config (no server keys)
- `third_party`: onesignal (app_id, enabled), mapbox (public_token, enabled)
- `branding`: site_name, logo_url, favicon_url, primary_color, secondary_color
- `flags`: resolved feature flags (key → { enabled, rollout_percent, ... })
- `modules`: on_demand, ai, ads, ranking, distance, sumsub, aura (safe fields only)

**Safety**: No secret keys are ever returned. Fields are whitelisted in the server config service.

## Feature flags (extended)

Table: `feature_flags` (existing), extended with:

- `rollout_percent` (0–100): percentage of users who see the flag when enabled
- `platforms_allowed`: array of web, customer, provider (null = all)
- `roles_allowed`: array of roles (null = all)
- `min_app_version`: minimum app version (semver)
- `environments_allowed`: production, staging, development (null = all)

**Rollout logic**:

- Deterministic: `hash(userId + flagKey) % 100` vs `rollout_percent`
- Superadmin always sees the flag as on
- If `userId` is missing (public), rollout is 0 unless the flag is enabled and allowed for public

## Integrations

- **Amplitude**: existing `amplitude_integration_config`; edit via Admin → Amplitude or Control Plane → Integrations (link).
- **OneSignal / Mapbox**: stored in `platform_settings.settings`; edit via Settings / Control Plane overview links.
- **Gemini, Sumsub, Aura**: new tables `gemini_integration_config`, `sumsub_integration_config`, `aura_integration_config` (env-scoped). Managed under **Control Plane → Integrations**. API keys/secrets are server-only and never returned in API responses.

## Module configs

Env-scoped tables (one row per environment):

- `on_demand_module_config`: ringtone path, durations, waiting screen, UI copy
- `ai_module_config`: enabled, sampling, cache TTL, budgets, per-provider/per-user limits
- `ads_module_config`, `ranking_module_config`, `distance_module_config`: stubs

All editable from **Control Plane → Modules**.

## Audit log

**Table**: `config_change_log`

- `changed_by`, `area` (flags|integration|module|ai_template), `record_key`, `before_state`, `after_state`, `created_at`

All admin writes (flags, integrations, modules) append a row here. View in **Control Plane → Audit log**.

## Superadmin UI

- **Control Plane → Overview**: environment selector and links to flags, integrations, modules, audit log
- **Control Plane → Feature flags**: preview resolver (user_id, role, platform, environment, app_version → resolved on/off)
- **Control Plane → Integrations**: Gemini, Sumsub, Aura (and links to Amplitude, OneSignal/Mapbox)
- **Control Plane → Modules → On-demand**: ringtone path, durations, UI copy
- **Control Plane → Modules → AI**: global AI limits and defaults
- **Control Plane → Modules → AI → Templates**: list and create AI prompt templates
- **Control Plane → Modules → AI → Usage**: AI usage log view
- **Control Plane → Modules → AI → Entitlements**: plan-based AI entitlements
- **Control Plane → Audit log**: list and filter config changes

**Feature flags (main admin)**: `/admin/settings/feature-flags` includes full edit form with rollout %, platforms allowed, roles allowed, min app version, and environments allowed (same fields as Control Plane preview).

All pages are superadmin-only (existing RoleGuard and `requireRoleInApi(['superadmin'])`).
