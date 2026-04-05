# Admin Tenant Scope Matrix

Date: 2026-03-22

This matrix classifies admin surfaces for global-default plus per-country override rollout.

## Classification

- `tenant_scoped`: already resolves tenant host and filters by tenant.
- `global_by_design`: should remain global for platform operation.
- `must_be_scoped`: currently global but impacts website content/settings per country.

## API Surface

| Area | Representative routes | Class | Notes |
|---|---|---|---|
| Tenant domains and tenant management | `/api/admin/tenant-domains`, `/api/admin/tenants` | tenant_scoped | Host-domain mapping for market routing already exists. |
| Provider/bookings/finance operations | `/api/admin/providers/*`, `/api/admin/bookings/*`, `/api/admin/reports/*` | tenant_scoped | Uses `resolveAdminApiTenantId` and tenant filters in many routes. |
| Admin settings (platform config) | `/api/admin/settings`, `/api/admin/settings/sales`, `/api/admin/settings/section-permissions` | must_be_scoped | Reads/writes `platform_settings` globally. |
| Public branding settings | `/api/public/settings/branding` | must_be_scoped | Reads global `platform_settings.settings.branding`. |
| Content CMS pages | `/api/admin/content/pages`, `/api/admin/content/pages/[id]` | must_be_scoped | Uses `page_content` without tenant scoping. |
| Content FAQs/resources/footer/about-us/profile/learning | `/api/admin/content/*` | must_be_scoped | Most routes are global today. |
| Featured cities | `/api/admin/content/featured-cities*` | partial | Route resolves tenant for provider counts only; city rows remain global. |
| Notification/email/sms templates | `/api/admin/notification-templates`, `/api/admin/email-templates`, `/api/admin/sms-templates` | must_be_scoped | Template rows are global today. |
| ISO registries and low-level ops | `/api/admin/iso-codes/*`, control-plane health/ops | global_by_design | Not market-customized content; remain global unless future need. |

## Data Table Scope Plan

| Table | Current | Target |
|---|---|---|
| `platform_settings` | global | global default + tenant override |
| `platform_secrets` | global singleton | global default + tenant override |
| `page_content` | global | global default + tenant override |
| `faqs` | global | global default + tenant override |
| `resources` | global | global default + tenant override |
| `featured_cities` | global | global default + tenant override |
| `footer_links` | global | global default + tenant override |
| `footer_app_links` | global | global default + tenant override |
| `footer_settings` | global | global default + tenant override |
| `about_us_content` | global | global default + tenant override |
| `profile_questions` | global | global default + tenant override |
| `preference_options` | global | global default + tenant override |
| `learning_categories` | global | global default + tenant override |
| `learning_articles` | global | global default + tenant override |
| `learning_homepage_sections` | global | global default + tenant override |
| `notification_templates` | global | global default + tenant override by `key` |
| `email_templates` | global | global default + tenant override by `name` |
| `sms_templates` | global | global default + tenant override by `name` |

## Compatibility Guardrails

- Keep response payloads unchanged for existing admin and public clients.
- Read precedence everywhere: tenant override -> global default -> existing hardcoded defaults (where present).
- Use additive migrations first; no destructive cleanup in initial rollout window.
