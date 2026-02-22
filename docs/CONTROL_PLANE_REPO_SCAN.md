# Control Plane — Existing Config Sources & Tables (Repo Scan)

This document records existing config endpoints and tables used by the Control Plane implementation. **Do not remove or replace these; orchestrate via the new config service.**

## Existing config endpoints (must keep)

| Endpoint | Method | Source table / logic | Used by |
|----------|--------|----------------------|---------|
| `/api/public/analytics-config?environment=` | GET | `amplitude_integration_config` | Web + RN via `packages/analytics` (fetchAmplitudeConfig) |
| `/api/public/third-party-config?service=` | GET | `platform_settings.settings` (onesignal, mapbox, amplitude, google) | Customer/Provider apps (OneSignal, Mapbox) |
| `/api/public/settings/branding` | GET | `platform_settings.settings.branding` | Web (PlatformSettingsProvider) |
| `/api/feature-flags/check?key=` | GET | `feature_flags` (feature_key, enabled) | Web (useFeatureFlag, isFeatureEnabled) |
| `/api/feature-flags/check` | POST | `feature_flags` (keys array) | Bulk check |
| `/api/provider/feature-flags` | GET | `feature_flags` (enabled only) | Provider portal (requireRoleInApi) |
| `/api/admin/feature-flags` | GET/POST | `feature_flags` | Superadmin (requireRole/requireRoleInApi) |
| `/api/admin/feature-flags/[id]` | GET/PATCH/DELETE | `feature_flags` | Superadmin |
| `/api/admin/integrations/amplitude` | GET/PUT | `amplitude_integration_config` | Superadmin Amplitude UI |

## Existing tables

- **feature_flags**: `id`, `feature_key` (UNIQUE), `feature_name`, `description`, `enabled`, `category`, `metadata` (JSONB), `created_at`, `updated_at`, `created_by`, `updated_by`. No rollout_percent or platforms_allowed yet — extend via migration.
- **amplitude_integration_config**: `id`, `api_key_public`, `api_key_server`, `ingestion_endpoint`, `environment`, portal toggles, `guides_enabled`, `surveys_enabled`, `sampling_rate`, `debug_mode`, `created_by`, `updated_by`, `created_at`, `updated_at`. One row per environment.
- **platform_settings**: `id`, `settings` (JSONB), `is_active`, `created_at`, `updated_at`. Settings include branding, onesignal, mapbox, amplitude, google, etc.
- **subscription_plans**: `id`, `features` (JSONB), etc. Used for provider plan and feature gating.
- **provider_subscriptions**: `provider_id`, `plan_id`, status, etc. Used to resolve active plan per provider.
- **audit_logs**: `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `metadata`, `created_at`. General audit; config_change_log is separate for config diffs.

## Repo patterns

- **API response**: `{ data, error }` via `successResponse()` / `errorResponse()` from `@/lib/supabase/api-helpers`.
- **Auth in API**: `requireRoleInApi(['superadmin'])` or `requireRoleInApi(['provider_owner','provider_staff'])`, pass `request` for Bearer token (mobile).
- **Provider scoping**: `getProviderIdForUser(userId, supabase)` from same api-helpers.
- **Admin UI**: Under `apps/web/src/app/admin/`, guarded by `RoleGuard` with `allowedRoles={["superadmin"]}` in layout; sidebar in `AdminShell.tsx`.
- **Audit**: `writeAuditLog({ actor_user_id, actor_role, action, entity_type, entity_id, metadata })` from `@/lib/audit/audit`.

## Safe config rules

- Analytics config: return only `api_key_public` and feature toggles; never `api_key_server`.
- Third-party: return only `app_id` / `public_token` / public keys; never server secrets.
- Config-bundle and all public endpoints must whitelist fields explicitly (no `...rest` of DB row).
