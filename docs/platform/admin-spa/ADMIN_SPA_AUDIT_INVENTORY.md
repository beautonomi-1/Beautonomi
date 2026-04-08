# Admin SPA audit inventory

**Generated:** 2026-04-07 (plan implementation).  
**Purpose:** Route/nav coverage, deep-link routes, global search targets, primary `/api/admin/*` usage per feature area, superadmin code verification, and gaps for staging validation.

**Related:** [ADMIN_API_PARITY_MATRIX.md](./ADMIN_API_PARITY_MATRIX.md), [ADMIN_REGRESSION_GUARDRAILS.md](./ADMIN_REGRESSION_GUARDRAILS.md), [admin-api-route-taxonomy.csv](../../admin-api-route-taxonomy.csv).

---

## 1. Automated coverage (do not duplicate manually)

| Check | Location |
|--------|-----------|
| Every `nav.ts` `href` → `App.tsx` route | [navRoutesRegression.test.ts](../../../apps/admin-web/src/regression/navRoutesRegression.test.ts) |
| Critical flows + RBAC hooks | [criticalFlows.ts](../../../apps/admin-web/src/regression/criticalFlows.ts), [authGuardRegression.test.ts](../../../apps/admin-web/src/regression/authGuardRegression.test.ts) |
| Loading UX heuristics | [loadingStateRegression.test.ts](../../../apps/admin-web/src/regression/loadingStateRegression.test.ts) |
| Every Next admin `route.ts` in taxonomy CSV | [check-admin-api-routes-in-taxonomy.mjs](../../../apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs) |

---

## 2. Sidebar nav vs `App.tsx` (inverse: routes without nav)

All items in [nav.ts](../../../apps/admin-web/src/config/nav.ts) are registered in [App.tsx](../../../apps/admin-web/src/App.tsx) (enforced by tests).

**Deep-link / detail / utility routes (no direct nav row):**

| Route pattern | Page / purpose |
|---------------|----------------|
| `support-tickets/:id` | Ticket detail |
| `bookings/:id` | Booking detail + mutations |
| `providers/:id` | Provider detail |
| `providers/distance-settings` | Distance matrix (**also** in sidebar under Providers & operations) |
| `users/:id` | User detail |
| `verifications/:id` | Verification detail |
| `reports/:reportKey` | Report detail ([ReportDetailPage](../../../apps/admin-web/src/routes/reports/ReportDetailPage.tsx)) |
| `ecommerce/orders/:id` | Product order detail |
| `gift-cards/:id` | Gift card detail |
| `explore/:id` | Explore post moderation detail |
| `broadcast/history`, `broadcast/compose` | Linked from Broadcast hub |
| `control-plane/*` (except hub) | Children: feature-flags, integrations/*, modules/*, safety-logs, maintenance/*, audit-log — only **overview** is in nav |
| `addons` | Add-ons list (**also** in sidebar under Content & catalog) |
| `login` | Auth |
| Redirect-only | `pricing-plans`, `subscription-plans` → `plans`; `custom-fields` → `settings/custom-fields`; `sms-templates` / `email-templates` → `notification-templates`; `settings/integrations/analytics` → `integrations/amplitude` |

**Resolved:** “Provider distance” and “Add-ons” are in [nav.ts](../../../apps/admin-web/src/config/nav.ts) (and mirrored in legacy [AdminShell.tsx](../../../apps/web/src/components/admin/AdminShell.tsx)).

---

## 3. Global search → SPA paths

[adminSearchSpaPaths.ts](../../../apps/admin-web/src/lib/adminSearchSpaPaths.ts) maps:

- `user` → `/users/:id`
- `booking` → `/bookings/:id`
- `provider` → `/providers/:id`

AdminChrome resolves these relative to `/admin`. **Staging check:** run a search hit and confirm navigation lands on the correct detail route.

---

## 4. Superadmin surfaces (code verification)

| Nav item | Route | Guard | Primary APIs |
|----------|--------|-------|----------------|
| Gods Eye | `gods-eye` | `useSuperadminPage` on [GodsEyePage](../../../apps/admin-web/src/routes/GodsEyePage.tsx); live map uses [GodsEyeLiveMap](../../../apps/admin-web/src/routes/GodsEyeLiveMap.tsx) | `GET /api/admin/gods-eye`, `GET /api/admin/gods-eye/map-state`, `POST /api/admin/gods-eye/audit` |
| Analytics | `analytics` | `useSuperadminPage` | `GET /api/admin/analytics` |
| Tenant domains | `settings/tenant-domains` | `useSuperadminPage` | `GET/POST/PATCH/DELETE /api/admin/tenant-domains` |
| Control Plane | `control-plane/overview` | `useSuperadminPage` on overview; child pages inherit superadmin nav | Mix: see §5 control-plane |
| Team permissions | `settings/team-permissions` | `useSuperadminPage` | `GET/PUT /api/admin/settings/section-permissions` |
| Compliance purge | `control-plane/compliance` | `useSuperadminPage` | `GET /api/admin/compliance/purge-audit`, `POST .../purge-user`, `POST .../purge-provider` |

**Shell:** [AdminChrome](../../../apps/admin-web/src/components/layout/AdminChrome.tsx) loads `GET /api/admin/tenants` only when `bootstrap?.isSuperadmin === true`.

**Staging checklist (manual):**

1. Superadmin user: Gods Eye loads map after Mapbox public config; Analytics period switch returns data.
2. Tenant picker changes scoped GET query (`withAdminScopeUrl`) — verify network tab for `tenant_id` (or equivalent) on list endpoints.
3. Non-superadmin: Gods Eye / Analytics / control-plane overview show permission denial, not API raw errors.

---

## 5. Page → primary admin API usage (by area)

Legend: **fetch** = raw `fetch()` (e.g. multipart). Non-admin: `POST /api/feature-flags/check` ([useTenantFeatureFlags.ts](../../../apps/admin-web/src/hooks/useTenantFeatureFlags.ts)).

### Shell / session

| Module | Endpoints |
|--------|-----------|
| [AdminSessionProvider](../../../apps/admin-web/src/providers/AdminSessionProvider.tsx) | Bootstrap via client `getBootstrap()` → `/api/admin/bootstrap`; section permissions `GET /api/admin/settings/section-permissions` |
| [AdminChrome](../../../apps/admin-web/src/components/layout/AdminChrome.tsx) | `GET /api/admin/nav-counts`, `GET /api/admin/tenants`, `GET /api/admin/activity`, `GET /api/admin/search` |

### Overview / ops

| Page | Endpoints |
|------|-----------|
| Dashboard | `GET /api/admin/dashboard` |
| Reports hub | (static links only) |
| Report detail | `GET /api/admin/reports/*`, export `GET /api/admin/export/analytics` |
| Support list/detail | `GET /api/admin/support-tickets`, `GET/PATCH .../support-tickets/:id`, assignees, messages, notes; **fetch** `POST .../upload` |
| Bookings | `GET /api/admin/bookings`, `POST .../bulk`, detail: `GET/PATCH .../bookings/:id`, cancel, refund |
| Providers | `GET /api/admin/providers`, detail `GET/PATCH .../providers/:id` |
| Provider distance | `PATCH /api/admin/providers/:id/distance-settings` |
| Staff | `GET /api/admin/staff` |
| Reviews | `GET /api/admin/reviews` |
| Disputes | `GET /api/admin/disputes`, `PATCH .../disputes/:id` |
| User reports | `GET /api/admin/user-reports` |
| Refunds | `GET /api/admin/refunds` |

### Finance

| Page | Endpoints |
|------|-----------|
| Finance overview | `GET /api/admin/finance/summary` |
| Payouts | `GET /api/admin/payouts`, approve/reject/mark-paid/mark-failed/initiate-transfer |
| Fees | `GET/POST/PATCH /api/admin/fees/configs`; `GET/POST /api/admin/fees/adjustments`; `GET/POST/PATCH /api/admin/fees/reconciliations` |
| Billing | `GET /api/admin/invoices` |
| Taxes | `GET /api/admin/taxes` |
| Platform fees | `GET /api/admin/platform-fees` |
| Plans | `GET/POST /api/admin/plans`, `POST/PUT /api/admin/subscription-plans`, `POST/PUT /api/admin/pricing-plans`, `GET/PUT .../pricing-plans/:id/features` |
| Provider subscriptions | `GET /api/admin/provider-subscriptions`, `GET /api/admin/plans`, `PATCH .../provider-subscriptions/:id` |
| Subscription metrics | `GET /api/admin/subscription-metrics` |

### Users / trust

| Page | Endpoints |
|------|-----------|
| Users | `GET /api/admin/users` |
| User detail | `GET/PATCH /api/admin/users/:id` |
| Verifications | `GET /api/admin/verifications`, detail `GET/PATCH .../verifications/:id`, view URL |
| Audit logs | `GET /api/admin/audit-logs`, export blob `GET /api/admin/export/audit-logs` |

### Content / catalog / explore

| Page | Endpoints |
|------|-----------|
| Content hub | (links only) |
| Learning articles | `GET /api/admin/content/learning/articles` |
| Resources | `GET /api/admin/content/resources` (raw JSON) |
| Catalog services | `GET /api/admin/catalog/services` |
| Global categories | CRUD `/api/admin/catalog/global-categories` |
| Explore list/detail | `GET/POST /api/admin/explore/posts`, `GET/PATCH .../posts/:id`, `DELETE .../explore/comments/:id` |

### E-commerce

| Page | Endpoints |
|------|-----------|
| Overview | `GET /api/admin/ecommerce/overview` |
| Orders | `GET /api/admin/product-orders`, detail `GET .../product-orders/:id` |
| Returns | `GET /api/admin/product-returns` |
| Catalog | `GET /api/admin/ecommerce/catalog` |
| Add-ons | `GET /api/admin/addons` |

### Marketing

| Page | Endpoints |
|------|-----------|
| Promotions | `GET /api/admin/promotions` |
| Loyalty | rules/milestones CRUD under `/api/admin/loyalty/*` |
| Gamification | point-rules, badges, backfill, initialize, provider recalculate |
| Gift cards | list/detail CRUD `/api/admin/gift-cards` |
| Notifications config | `GET /api/admin/notifications/config` |
| Broadcast history | `GET /api/admin/broadcast/history` |
| Broadcast compose | `POST .../broadcast/push|sms|email` |
| Automations | `GET /api/admin/automations` |
| Notification templates | `GET /api/admin/notification-templates` |

### Integrations

| Page | Endpoints |
|------|-----------|
| Webhooks | `GET /api/admin/webhooks/endpoints` |
| API keys | `GET /api/admin/api-keys` |
| Amplitude | `GET/PATCH?` via `GET/PUT /api/admin/integrations/amplitude` |
| Mapbox | `GET /api/admin/mapbox/config` |
| ISO codes | `GET /api/admin/iso-codes/*` tabs |

### Operations

| Page | Endpoints |
|------|-----------|
| Service zones | `GET /api/admin/service-zones` |
| System health | `GET /api/admin/system-health` |
| Monitoring | `GET /api/admin/monitoring/health` |
| Security | `GET /api/admin/security` |

### Settings / platform

| Page | Endpoints |
|------|-----------|
| General settings | `GET /api/admin/settings` |
| Feature flags (settings) | `GET /api/admin/feature-flags` |
| Custom fields | `GET /api/admin/custom-fields` |
| App version | `GET /api/admin/app-version` |
| Referrals | `GET/PATCH /api/admin/referrals`, FAQs CRUD |
| Referral sources | `GET /api/admin/providers` (providers list), `GET/POST/PATCH/DELETE /api/admin/referral-sources` |
| Tenant domains | see §4 |
| Team permissions | see §4 |

### Control plane (superadmin)

**Compliance:** [CompliancePurgePage.tsx](../../../apps/admin-web/src/routes/control-plane/CompliancePurgePage.tsx) — `GET /api/admin/compliance/purge-audit`, `POST .../purge-user`, `POST .../purge-provider`. Legacy Next parity: [compliance/page.tsx](../../../apps/web/src/app/admin/control-plane/compliance/page.tsx) (dialogs + same APIs).

Shared ops in [CpControlPlaneOps.tsx](../../../apps/admin-web/src/routes/control-plane/CpControlPlaneOps.tsx): safety logs, config-change-log, maintenance, maintenance-notify, AI usage/entitlements/templates, ranking scores/recompute.

[CpControlPlaneModules.tsx](../../../apps/admin-web/src/routes/control-plane/CpControlPlaneModules.tsx): modules distance/on-demand/safety/ranking/ai, ads overview `GET /api/admin/ads/overview`, campaigns list `GET /api/admin/ads/campaigns`, `PATCH .../ads/campaigns/:id`, control-plane modules ads + packs.

Integration pages: Sumsub, Gemini, Aura — `GET/PUT /api/admin/control-plane/integrations/*`.

[CpFeatureFlagsPage](../../../apps/admin-web/src/routes/control-plane/CpFeatureFlagsPage.tsx): `GET /api/admin/feature-flags`, `POST /api/admin/control-plane/flags-preview`.

---

## 6. Taxonomy vs SPA (residual notes)

- **Compliance purge:** Consumed in SPA ([CompliancePurgePage.tsx](../../../apps/admin-web/src/routes/control-plane/CompliancePurgePage.tsx)) and legacy Next ([compliance/page.tsx](../../../apps/web/src/app/admin/control-plane/compliance/page.tsx)).
- **Ads campaigns:** `GET` list + `PATCH .../ads/campaigns/:id` are used from [CpModuleAdsPage](../../../apps/admin-web/src/routes/control-plane/CpControlPlaneModules.tsx). There is **no** `POST /api/admin/ads/campaigns` handler in the taxonomy-backed route file (campaign creation may be provider-facing or deferred).

---

## 7. Contract / envelope notes

Many list endpoints use `getJson` / `getRawJson` depending on envelope shape. Support tickets list uses non-standard top-level keys (documented in parity matrix). **Mutations:** `mergeAdminScopeIntoJsonBody` applies to JSON body; confirm tenant scope for each `POST`/`PATCH` on staging.

---

## 8. How to refresh this document

1. Re-run: `rg '/api/admin|adminApi\\.' apps/admin-web/src` (or IDE search).
2. After adding routes: `node docs/scripts/generate-admin-route-taxonomy.mjs`.
3. Update §5 tables if new pages ship.
