# Superadmin Portal Audit Report

**Date:** 2025-03-03  
**Scope:** Beautonomi Superadmin Portal (apps/web), Next.js 16 App Router  
**Phases:** 1–2, 5, 6, 7, 8 done; 3–4 in progress or documented. QA checklist: `docs/SUPERADMIN_QA_CHECKLIST.md`.

---

## 1. Route Inventory

### 1.1 Admin page routes (`/src/app/admin/**/page.tsx`)

| Route path | Page file | Key components | API routes used | Required role | Data dependencies |
|------------|-----------|-----------------|------------------|---------------|-------------------|
| `/admin` | `admin/page.tsx` | RoleGuard, LoadingTimeout | (redirect only) | superadmin | — |
| `/admin/dashboard` | `admin/dashboard/page.tsx` | RoleGuard, fetcher, LoadingTimeout, EmptyState | `/api/admin/dashboard` | superadmin | dashboard stats |
| `/admin/gods-eye` | `admin/gods-eye/page.tsx` | RoleGuard, fetcher | `/api/admin/gods-eye` | superadmin | gods_eye |
| `/admin/analytics` | `admin/analytics/page.tsx` | RoleGuard, fetcher | `/api/admin/analytics` | superadmin | analytics |
| `/admin/reports` | `admin/reports/page.tsx` | RoleGuard | (static links) | superadmin | — |
| `/admin/reports/revenue` | `admin/reports/revenue/page.tsx` | RoleGuard, fetcher | `/api/admin/reports/revenue`, `/api/admin/export/analytics` | superadmin | reports |
| `/admin/reports/bookings` | `admin/reports/bookings/page.tsx` | fetcher | `/api/admin/reports/bookings`, `/api/admin/export/bookings` | superadmin | bookings |
| `/admin/reports/providers` | `admin/reports/providers/page.tsx` | RoleGuard, fetcher | `/api/admin/reports/providers` | superadmin | providers |
| `/admin/reports/customers` | `admin/reports/customers/page.tsx` | RoleGuard, fetcher | `/api/admin/reports/customers` | superadmin | customers |
| `/admin/reports/gift-cards` | `admin/reports/gift-cards/page.tsx` | (needs verification) | `/api/admin/reports/...` or gift-cards | superadmin | gift_cards |
| `/admin/providers` | `admin/providers/page.tsx` | RoleGuard, fetcher | `/api/admin/providers` | superadmin | providers |
| `/admin/providers/[id]` | `admin/providers/[id]/page.tsx` | RoleGuard, fetcher | `/api/admin/providers/[id]`, status, etc. | superadmin | providers |
| `/admin/providers/distance-settings` | `admin/providers/distance-settings/page.tsx` | RoleGuard, fetcher | providers, distance-settings | superadmin | providers, distance |
| `/admin/staff` | `admin/staff/page.tsx` | RoleGuard, fetcher | `/api/admin/staff`, reset-password | superadmin | staff |
| `/admin/bookings` | `admin/bookings/page.tsx` | RoleGuard, fetcher | `/api/admin/bookings` | superadmin | bookings |
| `/admin/bookings/[id]` | `admin/bookings/[id]/page.tsx` | RoleGuard, fetcher | `/api/admin/bookings/[id]`, cancel, refund, dispute | superadmin | bookings |
| `/admin/reviews` | `admin/reviews/page.tsx` | RoleGuard, fetcher | `/api/admin/reviews` | superadmin | reviews |
| `/admin/disputes` | `admin/disputes/page.tsx` | RoleGuard, fetcher | `/api/admin/disputes` | superadmin | disputes |
| `/admin/user-reports` | `admin/user-reports/page.tsx` | RoleGuard, fetcher | `/api/admin/user-reports` | superadmin | user_reports |
| `/admin/refunds` | `admin/refunds/page.tsx` | RoleGuard, fetcher | `/api/admin/refunds` | superadmin | refunds |
| `/admin/support-tickets` | `admin/support-tickets/page.tsx` | RoleGuard, fetcher | `/api/admin/support-tickets` | superadmin | support_tickets |
| `/admin/support-tickets/[id]` | `admin/support-tickets/[id]/page.tsx` | RoleGuard, fetcher | `/api/admin/support-tickets/[id]`, messages, notes | superadmin | support_tickets |
| `/admin/finance` | `admin/finance/page.tsx` | fetcher | `/api/admin/finance/summary`, transactions | superadmin | finance |
| `/admin/payouts` | `admin/payouts/page.tsx` | fetcher | `/api/admin/payouts`, mark-paid, approve, reject, mark-failed, initiate-transfer | superadmin | payouts |
| `/admin/fees` | `admin/fees/page.tsx` | RoleGuard, fetcher | `/api/admin/fees/configs`, adjustments, reconciliations | superadmin | fees |
| `/admin/settings/platform-fees` | `admin/settings/platform-fees/page.tsx` | RoleGuard, fetcher | `/api/admin/platform-fees` | superadmin | platform_fees |
| `/admin/taxes` | `admin/taxes/page.tsx` | RoleGuard, fetcher | `/api/admin/taxes` | superadmin | taxes |
| `/admin/plans` | `admin/plans/page.tsx` | RoleGuard | (redirect or API) | superadmin | plans |
| `/admin/provider-subscriptions` | `admin/provider-subscriptions/page.tsx` | RoleGuard, fetcher | `/api/admin/provider-subscriptions` | superadmin | provider_subscriptions |
| `/admin/subscription-revenue` | `admin/subscription-revenue/page.tsx` | RoleGuard, fetcher | subscription-metrics | superadmin | subscription_metrics |
| `/admin/billing` | `admin/billing/page.tsx` | RoleGuard, fetcher | `/api/admin/providers`, `/api/admin/invoices` | superadmin | providers, invoices |
| `/admin/users` | `admin/users/page.tsx` | RoleGuard, fetcher | `/api/admin/users`, bulk, role, etc. | superadmin | users |
| `/admin/users/[id]` | `admin/users/[id]/page.tsx` | RoleGuard, fetcher | `/api/admin/users/[id]`, password, impersonate, export, bookings | superadmin | users |
| `/admin/verifications` | `admin/verifications/page.tsx` | RoleGuard, fetcher | `/api/admin/verifications`, view | superadmin | verifications |
| `/admin/content` | `admin/content/page.tsx` | RoleGuard, fetcher | content/faqs, resources, featured-cities, pages, footer-links, app-links, profile-questions, footer-settings, preference-options, about-us | superadmin | content tables |
| `/admin/iso-codes` | `admin/iso-codes/page.tsx` | RoleGuard, fetcher | `/api/admin/iso-codes/languages`, countries, currencies, timezones, locales | superadmin | iso_* |
| `/admin/mapbox` | `admin/mapbox/page.tsx` | RoleGuard, MapboxConfigTab, ServiceZoneMap | `/api/admin/mapbox/config`, service-zones | superadmin | mapbox_config |
| `/admin/settings/feature-flags` | `admin/settings/feature-flags/page.tsx` | RoleGuard, fetcher | `/api/admin/feature-flags` | superadmin | feature_flags |
| `/admin/subscription-plans` | `admin/subscription-plans/page.tsx` | RoleGuard, fetcher | `/api/admin/subscription-plans` | superadmin | subscription_plans |
| `/admin/settings` | `admin/settings/page.tsx` | RoleGuard, fetcher | `/api/admin/settings`, travel-fees, iso-codes | superadmin | platform_settings |
| `/admin/addons` | `admin/addons/page.tsx` | RoleGuard (superadmin + provider_owner), fetcher | `/api/admin/addons`, services | superadmin or provider_owner | addons, services |
| `/admin/taxes` | (see above) | — | — | — | — |
| `/admin/staff` | (see above) | — | — | — | — |
| `/admin/security` | `admin/security/page.tsx` | RoleGuard, fetcher | `/api/admin/security`, payment-safety-copy, account-security-copy | superadmin | security |
| `/admin/notifications` | `admin/notifications/page.tsx` | RoleGuard, fetcher | `/api/admin/notifications/send`, templates, config, logs | superadmin | notifications |
| `/admin/broadcast` | `admin/broadcast/page.tsx` | RoleGuard, fetcher | broadcast/push, sms, email, history | superadmin | broadcast |
| `/admin/notification-templates` | `admin/notification-templates/page.tsx` | RoleGuard, fetcher | `/api/admin/notification-templates` | superadmin | notification_templates |
| `/admin/email-templates` | `admin/email-templates/page.tsx` | fetcher | `/api/admin/email-templates` | superadmin | email_templates |
| `/admin/sms-templates` | `admin/sms-templates/page.tsx` | RoleGuard, fetcher | `/api/admin/sms-templates` | superadmin | sms_templates |
| `/admin/system-health` | `admin/system-health/page.tsx` | RoleGuard, fetcher | `/api/admin/system-health` | superadmin | system_health |
| `/admin/monitoring` | `admin/monitoring/page.tsx` | RoleGuard, fetcher | `/api/admin/monitoring/health`, errors | superadmin | monitoring |
| `/admin/api-keys` | `admin/api-keys/page.tsx` | fetcher | `/api/admin/api-keys` | superadmin | api_keys |
| `/admin/webhooks` | `admin/webhooks/page.tsx` | fetcher | `/api/admin/webhooks/endpoints`, failures, test, retry | superadmin | webhooks |
| `/admin/audit-logs` | `admin/audit-logs/page.tsx` | RoleGuard, fetcher | `/api/admin/audit-logs`, `/api/admin/export/audit-logs` | superadmin | audit_logs |
| `/admin/gift-cards` | `admin/gift-cards/page.tsx` | RoleGuard, fetcher | `/api/admin/gift-cards` | superadmin | gift_cards |
| `/admin/promotions` | `admin/promotions/page.tsx` | RoleGuard, fetcher | `/api/admin/promotions` | superadmin | promotions |
| `/admin/catalog` | `admin/catalog/page.tsx` | RoleGuard, fetcher | `/api/admin/catalog/global-categories` | superadmin | catalog |
| `/admin/explore` | `admin/explore/page.tsx` | RoleGuard, ExploreModerationTable | `/api/admin/explore/posts` | superadmin | explore_posts |
| `/admin/control-plane` | `admin/control-plane/page.tsx` | (links) | — | superadmin | — |
| `/admin/control-plane/overview` | `admin/control-plane/overview/page.tsx` | RoleGuard | (config-change-log, etc.) | superadmin | — |
| `/admin/control-plane/feature-flags` | `admin/control-plane/feature-flags/page.tsx` | RoleGuard, fetcher | `/api/admin/feature-flags`, flags-preview | superadmin | feature_flags |
| `/admin/control-plane/audit-log` | `admin/control-plane/audit-log/page.tsx` | RoleGuard | audit-logs API | superadmin | audit_logs |
| `/admin/control-plane/safety-logs` | `admin/control-plane/safety-logs/page.tsx` | RoleGuard, fetcher | `/api/admin/safety/logs` | superadmin | safety_logs |
| `/admin/control-plane/integrations` | `admin/control-plane/integrations/page.tsx` | RoleGuard | (links) | superadmin | — |
| `/admin/control-plane/integrations/sumsub` | `admin/control-plane/integrations/sumsub/page.tsx` | RoleGuard, fetcher | sumsub route | superadmin | integrations |
| `/admin/control-plane/integrations/aura` | `admin/control-plane/integrations/aura/page.tsx` | RoleGuard, fetcher | aura route | superadmin | integrations |
| `/admin/control-plane/integrations/gemini` | `admin/control-plane/integrations/gemini/page.tsx` | RoleGuard, fetcher | gemini route | superadmin | integrations |
| `/admin/control-plane/modules/ai` | `admin/control-plane/modules/ai/page.tsx` | RoleGuard, fetcher | `/api/admin/control-plane/modules/ai` | superadmin | ai_config |
| `/admin/control-plane/modules/ai/usage` | `admin/control-plane/modules/ai/usage/page.tsx` | RoleGuard, fetcher | ai/usage | superadmin | ai_usage |
| `/admin/control-plane/modules/ai/entitlements` | `admin/control-plane/modules/ai/entitlements/page.tsx` | RoleGuard | entitlements | superadmin | — |
| `/admin/control-plane/modules/ai/templates` | `admin/control-plane/modules/ai/templates/page.tsx` | RoleGuard | ai templates | superadmin | — |
| `/admin/control-plane/modules/ads` | `admin/control-plane/modules/ads/page.tsx` | RoleGuard, fetcher | ads, packs | superadmin | ads |
| `/admin/control-plane/modules/distance` | `admin/control-plane/modules/distance/page.tsx` | RoleGuard, fetcher | distance | superadmin | distance |
| `/admin/control-plane/modules/ranking` | `admin/control-plane/modules/ranking/page.tsx` | RoleGuard, fetcher | ranking | superadmin | ranking |
| `/admin/control-plane/modules/safety` | `admin/control-plane/modules/safety/page.tsx` | RoleGuard, fetcher | safety | superadmin | safety |
| `/admin/control-plane/modules/on-demand` | `admin/control-plane/modules/on-demand/page.tsx` | RoleGuard | on-demand | superadmin | — |
| `/admin/ecommerce/orders` | `admin/ecommerce/orders/page.tsx` | RoleGuard, fetcher | product-orders | superadmin | product_orders |
| `/admin/ecommerce/products` | `admin/ecommerce/products/page.tsx` | RoleGuard, fetcher | (products) | superadmin | products |
| `/admin/ecommerce/returns` | `admin/ecommerce/returns/page.tsx` | RoleGuard, fetcher | `/api/admin/product-returns` | superadmin | product_returns |
| `/admin/gamification/badges` | `admin/gamification/badges/page.tsx` | RoleGuard, fetcher | `/api/admin/gamification/badges`, backfill | superadmin | badges |
| `/admin/gamification/point-rules` | `admin/gamification/point-rules/page.tsx` | RoleGuard | point-rules | superadmin | point_rules |
| `/admin/loyalty` | `admin/loyalty/page.tsx` | RoleGuard, fetcher | `/api/admin/loyalty/rules`, milestones | superadmin | loyalty |
| `/admin/pricing-plans` | `admin/pricing-plans/page.tsx` | (needs verification) | plans/pricing | superadmin | — |
| `/admin/settings/referrals` | `admin/settings/referrals/page.tsx` | RoleGuard, fetcher | referrals, referrals/faqs | superadmin | referrals |
| `/admin/settings/app-version` | `admin/settings/app-version/page.tsx` | fetcher | `/api/admin/app-version` | superadmin | app_version |
| `/admin/settings/integrations/analytics` | `admin/settings/integrations/analytics/page.tsx` | (needs verification) | amplitude | superadmin | — |
| `/admin/integrations/amplitude` | `admin/integrations/amplitude/page.tsx` | RoleGuard, fetcher | `/api/admin/integrations/amplitude` | superadmin | amplitude |
| `/admin/automations` | `admin/automations/page.tsx` | RoleGuard, fetcher | automations, automations/stats | superadmin | automations |
| `/admin/custom-fields` | `admin/custom-fields/page.tsx` | RoleGuard, fetcher | `/api/admin/custom-fields` | superadmin | custom_fields |

**Note:** Reports page (`/admin/reports`) uses a **static list** of report cards (not mock data for tables); each report sub-route uses real APIs. Addons page allows `provider_owner` in addition to `superadmin` (by design).

### 1.2 Shared admin components (`/src/components/admin/`)

| Component | Purpose | Used by |
|-----------|---------|--------|
| `AdminShell.tsx` | Layout, sidebar nav, search, user menu, notifications | All admin pages (via layout) |
| `BulkActionsBar.tsx` | Bulk action toolbar | (check usage) |
| `ExploreModerationTable.tsx` | Explore post moderation table | `admin/explore/page.tsx` |
| `NotificationsDropdown.tsx` | Notifications in shell | AdminShell |
| `WysiwygEditor.tsx` | Rich text editor | Content/template pages |
| `ImpersonationBanner.tsx` | Impersonation warning | (when impersonating) |

---

## 2. Broken / Incomplete

| Item | Location | Details |
|------|----------|--------|
| **Custom-fields response shape** | `admin/custom-fields/page.tsx` ~70–71 | Page uses `response.fields`; API returns `{ data: { fields } }`. Fetcher returns full body, so should use `response.data?.fields`. Comment says "placeholder" but API exists; fix response handling. |
| **Reports page** | `admin/reports/page.tsx` | Static array of report cards (by design, not broken). No mock table data. |
| **api-keys response shape** | `admin/api-keys/page.tsx` ~62 | Uses `fetcher.get<{ keys: ApiKey[] }>`; verify API returns `{ data: { keys } }` or `{ keys }` and align. |
| **notification-templates response** | `admin/notification-templates/page.tsx` ~73 | Uses `fetcher.get<{ data?: { templates?: ... }; templates?: ... }>`; ensure API and types match. |
| **Console.error in catch** | Multiple admin pages | Many pages use `console.error(...)` in catch blocks. Acceptable for debugging; consider forwarding to toast or error state so user sees message (Phase 3). |
| **integrations/amplitude** | `admin/integrations/amplitude/page.tsx` ~64 | `console.log("No Amplitude config found, using defaults")` — remove or gate behind dev flag. |

---

## 3. Risks (security / role / secrets)

| Risk | Location | Recommendation |
|------|----------|----------------|
| **Middleware not wired** | (fixed) | The app uses **proxy** (`src/proxy.ts`) for auth: Supabase `createServerClient`, `getUser()`, `getUserRole(user.id)` from `users` table, and for `/admin` requires `userRole === 'superadmin'` else redirect. **Done:** `src/middleware.ts` now exports `proxy` as default and `config` so Next.js runs it. Admin protection is server-side. Non-superadmin is redirected to `/` (existing `redirectToHome()`). |
| **requireRole vs requireRoleInApi** | Several `/api/admin/*` routes | Some routes use `requireRole(["superadmin"])` from `@/lib/auth/requireRole` (no `request`). That path uses `getSupabaseServer()` only — **Bearer token from mobile/Expo not supported** for those routes. Prefer `requireRoleInApi(["superadmin"], request)` for all admin API routes for consistency and mobile support. |
| **addons API allows provider_owner** | `api/admin/addons/route.ts`, `[id]/route.ts` | By design: provider_owner can manage their addons. Ensure RLS/scope limits provider_owner to own `provider_id` only (already documented in code). |
| **Settings route “secret configured”** | `api/admin/settings/route.ts` ~316 | GET merges "configured" markers for secrets for superadmin UI. Ensure **no raw secret values** are ever returned; only booleans or masked placeholders. |
| **Webhook test endpoint** | `api/admin/webhooks/endpoints/[id]/test/route.ts` | Already uses `requireRoleInApi(["superadmin"])`. Ensure test action does not expose internal secrets in response (Phase 2). |
| **getSupabaseAdmin usage** | Various admin API routes | Service role must only be used server-side; never expose keys to client. Current usage is server-side only; no key leakage found in responses. |

---

## 4. Inconsistencies

| Area | Detail |
|------|--------|
| **Auth helper mix** | Some admin APIs use `requireRole` from `@/lib/auth/requireRole`, others `requireRoleInApi` from `@/lib/supabase/api-helpers`. Export routes and a few others use `requireRole` (no request) — inconsistent with App Router + optional mobile. Standardize on `requireRoleInApi(["superadmin"], request)` for all `/api/admin/*`. |
| **Response shape** | Most APIs use `successResponse(data)` → `{ data, error: null }`. Some clients expect `response.data`, others `response.fields` or `response.keys`. Align: API always returns `{ data, error }`; pages always read `response.data`. |
| **Pagination** | Mix of `page`/`limit` and cursor. Use shared `getPaginationParams()` and `createPaginatedResponse()` where applicable (already present in api-helpers). |
| **Error handling** | Some routes return `errorResponse(message, code, status)`, others throw and use `handleApiError`. Both end up with consistent JSON shape; ensure all admin routes use one of these and never raw NextResponse.json for errors. |
| **Loading/empty/error UX** | Loading: mix of LoadingTimeout, skeleton, inline "Loading...". Empty: some use EmptyState, others ad hoc. Error: some toast only, some setError + inline. Standardize in Phase 5/6. |

---

## 5. API routes auth coverage

- **Sampled:** All sampled `/api/admin/*` routes enforce superadmin (or superadmin + provider_owner for addons). No route was found without any auth.
- **Recommendation:** Run a single grep/script to ensure every `apps/web/src/app/api/admin/**/route.ts` file contains at least one of `requireRoleInApi` or `requireRole` with `superadmin` before deployment.

---

## 6. Phase 2 completion (role + security)

- **Middleware:** `src/middleware.ts` exports `proxy` as default; proxy already enforces superadmin for `/admin/*` (redirect to `/`).
- **Secrets:** `GET /api/admin/settings` returns only masked values (`***`) for platform_secrets; no raw keys in response.
- **API auth:** All sampled `/api/admin/*` routes use `requireRole(["superadmin"])` or `requireRoleInApi(["superadmin"], request)`. Some use `requireRole` (no request) for web-only; Bearer support is via `requireRoleInApi` where used. No change to business logic.

## 7. Phase 3 (functional UI) – partial

- **Finance page:** On load error, clear transactions and total (was leaving stale data when only one of summary/transactions failed). Removed dead `_handleExport`; Export CSV button uses inline handler to `/api/admin/export/finance`.
- **API keys page:** Uses `response.keys`; API returns `{ keys }` — correct. Create flow uses `response.key.api_key` — API returns that on POST — correct.
- **Notification-templates page:** Handles both `response.data?.templates` and `response.templates` — correct.
- **Gift cards report:** Export button shows "Export feature coming soon"; no `/api/admin/export` for gift-cards yet — documented for future.
- **Refunds page:** Safe response handling — `setRefunds(response.data?.refunds ?? [])` to avoid crash when `data` is missing.
- **Disputes page:** Safe response handling — `setDisputes(response.data?.disputes ?? [])`.
- **Audit-logs page:** `setLogs(response.data ?? [])`, `setTotal(response.meta?.total ?? 0)`; realtime subscription with cleanup; Export wired to `/api/admin/export/audit-logs`.
- **Payouts page:** `setPayouts(response.data ?? [])`, `setTotal(response.meta?.total ?? 0)`.
- **Bookings page:** `setBookings(response.data ?? [])`; bulk actions wired to `/api/admin/bookings/bulk`.
- **Support-tickets page:** `setTickets(response.tickets ?? response.data?.tickets ?? [])` (API returns `{ tickets }`; fallback for `data.tickets` if API changes).
- **Providers page:** `setProviders(response.data ?? [])`.
- **Verifications page:** `setVerifications(response.data ?? [])`.
- **Reviews page:** `setReviews(response.data?.reviews ?? [])`, `setStatistics(response.data?.statistics ?? null)`.

## 9. Phase 4 (data correctness) – partial

- **Users API:** Uses `users` table; returns `{ data: { data: users, meta } }`; filters by search (full_name, email, phone) and role; pagination via getPaginationParams. Frontend parses `response.data.data` and `response.data.meta` — correct.
- **Bookings API:** Uses `bookings` table; filters by status and date (scheduled_at); enriches with users/providers/locations in separate queries but transformation returns flat booking only (admin UI shows customer_id/provider_id in detail). No bug.
- **Verifications API:** Uses `user_verifications`; status filter; enriches with user and reviewer from `users` — correct.
- **Reviews API:** Uses `reviews` with joins to customer, provider, booking; returns reviews + statistics + pagination. Safe handling added on page.
- **Note:** `POST /api/admin/users` createUserSchema uses role enum `["customer", "provider", "admin", "superadmin"]`; app UserRole type uses `provider_owner`/`provider_staff` (no "provider" or "admin"). If creating users from admin, ensure DB/backend maps "provider" to provider_owner or adjust schema to match UserRole.

## 10. Phase 5 (realtime, polling, empty/error states) – partial

- **Audit logs:** Realtime (Supabase postgres_changes on `audit_logs`) already present; cleanup on unmount. **Added:** (1) Polling fallback when realtime is disabled — every 30s refetch with cleanup on unmount; (2) channel ref to avoid duplicate subscription when toggling realtime.
- **Monitoring:** Already has 30s auto-refresh when enabled, error state with EmptyState + Retry, and manual "Refresh Now" button.
- **Empty/error patterns:** Most admin list pages use LoadingTimeout, EmptyState (with optional Retry action), and error state; consistent with shared `@/components/ui/empty-state` and `@/components/ui/loading-timeout`.

## 8. Phase 7 – Audit logging (complete)

- **Existing coverage:** Many admin routes already call `writeAuditLog`: provider status/verify, user role, refunds, payouts (approve, mark-paid, mark-failed, initiate-transfer), api-keys, settings, impersonation, disputes, bookings (cancel, refund, bulk), reviews, feature-flags, etc.
- **Gaps fixed (2025-03-03):**
  - **`POST /api/admin/payouts/[id]/reject`** – added `writeAuditLog` with `action: "admin.payout.reject"`, entity_type `payout`, metadata `provider_id`, `amount`, `reason`.
  - **`POST /api/admin/webhooks/failures/[id]/retry`** – added `writeAuditLog` with `action: "admin.webhook.retry"`, entity_type `webhook_event`, metadata `endpoint_id`, `delivered`, `response_code`.
  - **`PATCH /api/admin/verifications/[id]`** – added `writeAuditLog` with `action: "admin.verification.review"`, entity_type `user_verification`, metadata `status`, `user_id`, `rejection_reason` (when rejected).

## 9. Phase 6 – UX polish and admin design system (complete)

- **Design system doc:** `docs/ADMIN_DESIGN_SYSTEM.md` – conventions for buttons, page header, filter bar, tables, dialogs, loading/error states.
- **Reusable components:**  
  - `AdminPageHeader` – title, optional description, optional right-aligned actions.  
  - `AdminFilterBar` – wrapper for filter rows (search + selects) with consistent card styling.
- **Button consistency:** Replaced raw `<button>` with `<Button>` in `AdminShell` (mobile menu trigger, user dropdown trigger) and `NotificationsDropdown` (bell trigger, close button, notification list items).
- **Reference adoption:** Admin Refunds page uses `AdminPageHeader` and `AdminFilterBar`; other list pages can adopt incrementally.

## 10. Phase 3 continued (spot-check)

- **Bookings, Payouts, Reviews:** Confirmed null-safe response handling (`response.data ?? []`, `response.meta?.total ?? 0`, `response.data?.reviews ?? []`), toasts on mutations, LoadingTimeout + EmptyState. Payouts page: added explicit `redirectTo="/"` on RoleGuard for consistency.
- **Raw `<button>` usage:** Still present in fees, finance, content cards, catalog, notifications, ecommerce (pagination/close). Can be migrated incrementally to `<Button variant="ghost" size="icon">` per `docs/ADMIN_DESIGN_SYSTEM.md`. No functional bugs identified.

## 11. Next steps (Phase 4 optional)

- **Phase 4:** Entity mapping and API correctness (e.g. user role enum alignment if needed).

## 12. Post-audit updates (design system rollout)

- **RoleGuard:** All admin pages that use `RoleGuard` now pass an explicit `redirectTo` (either `"/"` or `"/admin/dashboard"`).
- **AdminPageHeader + AdminFilterBar:** Adopted on Refunds, Disputes, Payouts, Support Tickets, Gift Cards, Audit Logs, Custom Fields. Other list pages (Users, Providers, Bookings, Reviews, Verifications) keep custom motion/backdrop layouts; they can adopt later if desired.
- **Button usage:** All admin interactive controls use `<Button>` from `@/components/ui/button`. This includes: content cards (FooterLinkCard, AppLinkCard, AboutUsCard, SocialMediaCard, FooterSettingsCard); AdminShell and NotificationsDropdown; fees (info popover triggers); catalog (category edit/delete, icon toggles, icon picker); finance (info popovers); ecommerce (products, orders, returns—pagination and dialogs); promotions, gift-cards; UserDetailModal (password toggle); MapboxConfigTab and ServiceZonesTab (token toggles, remove chips); notifications (template edit/delete). No raw `<button>` remain under `apps/web/src/app/admin`.

---

*Phases 1–2, 5, 6, 7, 8 complete. Phase 3 started (finance fix, response-shape verification).*
