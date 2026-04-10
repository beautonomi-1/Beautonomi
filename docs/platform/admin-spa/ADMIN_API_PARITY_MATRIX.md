# ADMIN_API_PARITY_MATRIX

**Purpose:** Single source of truth mapping **every** admin UI surface to **every** `/api/admin/*` call, authorization, and contract expectations. **No SPA feature work may start for a page until its rows are complete and signed.**

**Contract program:** Platform standards for envelopes, errors, pagination, filtering, versioning, and contract tests live in [`ADMIN_API_CONTRACT_GUIDELINES.md`](./ADMIN_API_CONTRACT_GUIDELINES.md). Parity rows should reference those rules when marking APIs `Reviewed`.

**Owner:** FE lead (maintains structure); BE lead (validates AuthZ + response shapes); PM (validates product parity).

**Completion gate:** Wave 0 rows + all pages in **current wave** must be `Reviewed` before that wave’s implementation merges to `main`.

**Status key:** `Draft` | `In review` | `Reviewed` | `Deprecated (product approved)`

**Seed:** Generated from `apps/web/src/components/admin/AdminShell.tsx` (`navGroups`), `apps/web/src/app/admin/**/page.tsx` (96 routes, 2026-04-05), and targeted greps for `"/api/admin` usage. For the **Vite admin SPA**, use [`ADMIN_SPA_AUDIT_INVENTORY.md`](./ADMIN_SPA_AUDIT_INVENTORY.md) (route inverse map + page→API summary). Reconcile with `docs/admin-api-route-taxonomy.csv` after `node docs/scripts/generate-admin-route-taxonomy.mjs` (latest regen: **261** API rows, 2026-04-08 — see §8 Implementation Delta).

---

## 1. How to populate (mandatory process)

1. **Seed API list:** Run `node docs/scripts/generate-admin-route-taxonomy.mjs` → use `docs/admin-api-route-taxonomy.csv` as inventory of **server** routes.  
2. **Seed UI usage:** Grep `apps/web/src/app/admin` (and child components under `apps/web/src/components/admin`) for `"/api/admin` and `fetcher.` / `fetch(` patterns; attach each match to a **page route**. For `apps/admin-web`, grep `adminApi.` and `"/api/admin"` under `apps/admin-web/src` (see [`ADMIN_SPA_AUDIT_INVENTORY.md`](./ADMIN_SPA_AUDIT_INVENTORY.md)).  
3. **Cross-check nav:** `apps/web/src/components/admin/AdminShell.tsx` `navGroups` hrefs ↔ `apps/web/src/app/admin/**/page.tsx` exists.  
4. **Per row:** Open the corresponding `apps/web/src/app/api/admin/**/route.ts` and record `requireAdminSection` / `requireRoleInApi` usage.  
5. **Sign-off:** FE + BE on each **Reviewed** row.

### 1.1 API audit summary (baseline for contract work)

| Theme | Finding | Target (see contract guidelines) |
|-------|---------|-----------------------------------|
| **Inventory** | **259** admin `route.ts` handlers; full list in `docs/admin-api-route-taxonomy.csv` | Regenerate CSV when adding routes; CI blocks orphan files. |
| **Response envelope** | Mix of `{ data, error }` (`successResponse` / `errorResponse`) and **raw** `NextResponse.json` (`{ tickets }`, `{ error: string }`, `{ success: true }`, etc.) | New/changed handlers use standard envelope; migrate legacy when touching. |
| **List shape** | Some lists nest `{ data: rows, meta }` **inside** envelope `data` (e.g. users); others return domain keys at root **without** envelope | Standard: `data: { items, meta }` + outer envelope. |
| **Pagination** | `page`+`limit` (`getPaginationParams`) vs `offset`+`limit`; default limits vary (20–100) | Standard query params + `meta`; document per row until migrated. |
| **High-volume lists** | e.g. `GET /api/admin/bookings` returns full filtered set for tenant (no server pagination) | Add pagination when editing; document risk in matrix until fixed. |
| **AuthZ** | `requireAdminSection` vs `requireRoleInApi([...])` vs ad hoc superadmin checks | Document section + exceptions per row; align with nav / SPA guards. |
| **Duplication** | Repeated tenant resolution + CRUD patterns across `content/*`, `catalog/*`, similar resources | Prefer shared helpers when refactoring clusters. |

---

## 2. Section constants ↔ nav (from codebase)

| Section constant | Label (UI) | Roles (non-superadmin) | Source |
|------------------|------------|--------------------------|--------|
| `overview` | Overview | `admin_support` | `ADMIN_SECTION_OVERVIEW` |
| `support` | Support | `support_agent`, `admin_support` | `ADMIN_SECTION_SUPPORT` |
| `providers_operations` | Providers & operations | `admin_support` | `ADMIN_SECTION_PROVIDERS_OPERATIONS` |
| `finance` | Finance | `admin_finance` | `ADMIN_SECTION_FINANCE` |
| `users_trust` | Users & trust | `admin_trust` | `ADMIN_SECTION_USERS_TRUST` |
| `content_catalog` | Content & catalog | `admin_content` | `ADMIN_SECTION_CONTENT_CATALOG` |
| `ecommerce` | E‑commerce | `admin_ecommerce` | `ADMIN_SECTION_ECOMMERCE` |
| `marketing_comms` | Marketing & comms | `admin_marketing` | `ADMIN_SECTION_MARKETING_COMMS` |
| `integrations_dev` | Integrations & dev | `admin_integrations` | `ADMIN_SECTION_INTEGRATIONS_DEV` |
| `operations` | Operations | `admin_operations` | `ADMIN_SECTION_OPERATIONS` |
| `platform_config` | Platform config | `admin_platform_config` | `ADMIN_SECTION_PLATFORM_CONFIG` |

Superadmin may access all sections. Sidebar also uses `superadminOnly` on: **Tenant domains**, **Team permissions**. **Market Coverage** (`/admin/service-zones`) uses the **Operations** section (same as `requireAdminSection(ADMIN_SECTION_OPERATIONS)` on `/api/admin/service-zones/*`).

---

## 3. Shell / global (Wave 0) — seeded rows

Complete these first; they block the SPA shell.

| UI route / component | HTTP | API path | AuthZ (section / role) | Query/body | Response notes | Client method (pkg) | Status |
|----------------------|------|----------|-------------------------|------------|----------------|----------------------|--------|
| AdminShell | GET | `/api/admin/nav-counts` | `requireRoleInApi(ALL_ADMIN_ROLES)` — any admin role gets tenant-scoped badge counts (finance/support/trust, etc.) | — | Keys align with nav `href`s | `createAdminApiClient().getJson('/api/admin/nav-counts')` — SPA treats **401/403** as **no badges** (empty object) | In review |
| AdminShell | GET | `/api/admin/settings/section-permissions` | `requireRoleInApi(ALL_ADMIN_ROLES)` on GET | — | `{ sectionRoles }` effective matrix | `createAdminApiClient().getJson('/api/admin/settings/section-permissions')` → `sectionRoles` (TanStack Query, **5m** stale) | In review |
| AdminShell | GET | `/api/admin/search` | `requireAdminSection(ADMIN_SECTION_USERS_TRUST)` | `q` | Users, bookings, providers | `createAdminApiClient().getJson('/api/admin/search?q=…')` | In review |
| AdminShell (superadmin scope UI) | GET | `/api/admin/tenants` | Superadmin list on **GET** (`route.ts`) | — | Tenant pick list | `createAdminApiClient().getJson('/api/admin/tenants')` | In review |
| NotificationsDropdown | GET | `/api/admin/activity` | `requireAdminSection(ADMIN_SECTION_OVERVIEW)` | — | Activity feed payload (see route) | `createAdminApiClient().getJson('/api/admin/activity')` — SPA: header **`<details>`** feed (lighter than legacy dropdown UI; parity sign-off may require richer component) | In review |
| Bootstrap | GET | `/api/admin/bootstrap` | `requireRoleInApi(ALL_ADMIN_ROLES)` | — | `{ user, role, is_superadmin }` — Vitest route tests in `apps/web` | `createAdminApiClient().getBootstrap()` (`@beautonomi/admin-api-client`, Zod `adminBootstrapSchema`) | Reviewed |

---

## 4. Seeded page → primary API inventory (96 routes)

Use this table as the **index** for deep-dive sub-tables (§5). **AuthZ column** is the *page’s* RBAC intent from `RoleGuard` / nav section where obvious; confirm every call in `route.ts` before marking `Reviewed`.

**Legend — In nav:** `Y` = linked in `AdminShell` `navGroups`; `N` = not in sidebar; `R` = redirect-only route; **Wave** follows `ADMIN_SPA_MIGRATION_PLAN_V2.md` grouping.

| # | Legacy path | Wave | Section (nav) | In nav | Primary `/api/admin/*` usage (representative) | Notes |
|---|-------------|------|-----------------|--------|-----------------------------------------------|-------|
| 1 | `/admin` | W0 | overview | N | — | Client redirect → dashboard |
| 2 | `/admin/login` | W0 | — | N | `POST /api/auth/sign-in` (SPA + cookie session) | Auth flows (non-admin API); shell not shown |
| 3 | `/admin/dashboard` | W0 | overview | Y | `GET /api/admin/dashboard`; superadmin: `GET /api/admin/dashboard/marketing-insights` | SPA: methodology panel, `generated_at`, customer fallback flag, metric deep links; RPC `admin_dashboard_tenant_customer_count` (migration 446). Superadmin: marketing/demographics panels (migrations **447–448**). |
| 4 | `/admin/gods-eye` | W0 | overview | Y | `GET /api/admin/gods-eye` | Map-heavy (responsive M4) |
| 5 | `/admin/analytics` | W0 | overview | Y | `GET /api/admin/dashboard`, `GET /api/admin/analytics`, export | |
| 6 | `/admin/reports` | W0 | overview | Y | — | Hub only (links to sub-reports) |
| 7 | `/admin/support-tickets` | W1 | support | Y | `GET /api/admin/support-tickets` | **SPA (pattern wave):** list + filters; `status`/`priority`/`category`/`assign`/`page`/`q` in URL; row action → legacy detail (row 8). |
| 8 | `/admin/support-tickets/[id]` | W1 | support | N | `GET/PATCH .../support-tickets/:id`, `POST .../messages`, `.../notes`, `GET /api/admin/support-ticket-assignees` | |
| 9 | `/admin/providers` | W1 | providers_operations | Y | `GET /api/admin/providers`, `PATCH .../status`, `.../verify`, `POST .../bulk` | |
| 10 | `/admin/providers/[id]` | W1 | providers_operations | N | `GET/PATCH /api/admin/providers/:id`, payout accounts | |
| 11 | `/admin/providers/distance-settings` | W1 | providers_operations | N | `GET /api/admin/providers`, `.../:id/distance-settings` | **SPA (pattern wave):** table + modal; `GET /api/admin/providers` response extended with `max_service_distance_km`, `is_distance_filter_enabled`, `name` alias. |
| 12 | `/admin/staff` | W1 | providers_operations | Y | `GET /api/admin/staff`, `PATCH .../:id`, `POST .../:id/reset-password` | |
| 13 | `/admin/bookings` | W1 | providers_operations | Y | `GET /api/admin/bookings`, `POST .../bulk`, export | **SPA (pattern wave):** cards + tabs + bulk + CSV via **`adminApi.downloadBlob`** / `downloadAdminBlob`; RBAC via `ADMIN_SECTION_PROVIDERS_OPERATIONS` (legacy Next page used `superadmin`-only guard — SPA aligns with API). |
| 14 | `/admin/bookings/[id]` | W1 | providers_operations | N | `GET/PATCH /api/admin/bookings/:id`, `POST .../cancel`, `.../refund` | **SPA:** detail + PATCH + cancel/refund modals; customer/provider deep links → legacy until rows 9–10 / 36–37 migrate. |
| 15 | `/admin/reviews` | W1 | providers_operations | Y | `GET/PATCH/DELETE /api/admin/reviews`, export | |
| 16 | `/admin/disputes` | W1 | providers_operations | Y | `GET /api/admin/disputes`, `PATCH .../:id` | **SPA (pattern wave):** list + client search + resolve modal; same RBAC note as bookings vs legacy `superadmin` guard. |
| 17 | `/admin/user-reports` | W1 | providers_operations | Y | `GET /api/admin/user-reports`, `PATCH .../:id` | |
| 18 | `/admin/refunds` | W1 | providers_operations | Y | `GET /api/admin/refunds`, `POST .../:id` | |
| 19 | `/admin/finance` | W2 | finance | Y | `GET /api/admin/finance` (+ breakdown endpoints) | |
| 20 | `/admin/payouts` | W2 | finance | Y | `GET/POST/PATCH /api/admin/payouts` (+ provider payout routes) | |
| 21 | `/admin/fees` | W2 | finance | Y | `GET/POST/PATCH /api/admin/fees/configs`; `GET/POST /api/admin/fees/adjustments`; `GET/POST/PATCH /api/admin/fees/reconciliations` | **SPA:** [`FeesConfigsPage`](../../apps/admin-web/src/routes/finance/FeesConfigsPage.tsx) — tabs + `?tab=` / `page`; configs `getJson` (unwrap `{ data }`); adjustments + reconciliations lists `getRawJson` (`{ data, meta }`); mutations `postJson` / `patchJson`. AuthZ `ADMIN_SECTION_FINANCE` (legacy page used `superadmin` `RoleGuard` — SPA matches API). |
| 22 | `/admin/billing` | W2 | finance | Y | `GET /api/admin/billing` (+ related) | |
| 23 | `/admin/taxes` | W2 | finance | Y | `GET/POST/PATCH /api/admin/taxes` | |
| 24 | `/admin/settings/platform-fees` | W2 | finance | Y | `GET/PATCH /api/admin/platform-fees` | Lives under settings path |
| 25 | `/admin/plans` | W2 | finance | Y | Wraps subscription-plans: `GET/PUT/POST /api/admin/subscription-plans`, `PUT/POST /api/admin/pricing-plans`, `GET /api/admin/plans` | Superadmin `RoleGuard` |
| 26 | `/admin/pricing-plans` | W2 | finance | R | — | Server redirect → `/admin/plans` |
| 27 | `/admin/subscription-plans` | W2 | finance | N | Same family as plans | Direct route still exists |
| 28 | `/admin/provider-subscriptions` | W2 | finance | Y | `GET /api/admin/provider-subscriptions` | |
| 29 | `/admin/subscription-revenue` | W2 | finance | Y | `GET /api/admin/subscription-metrics` | |
| 30 | `/admin/reports/revenue` | W2 | finance | N | `GET /api/admin/reports/revenue`, export | |
| 31 | `/admin/reports/bookings` | W2 | finance | N | `GET /api/admin/reports/bookings`, export | |
| 32 | `/admin/reports/providers` | W2 | finance | N | `GET /api/admin/reports/providers`, export | |
| 33 | `/admin/reports/customers` | W2 | finance | N | `GET /api/admin/reports/customers`, export | |
| 34 | `/admin/reports/gift-cards` | W2 | finance | N | `GET /api/admin/reports/gift-cards` | |
| 35 | `/admin/reports/yoco-reconciliation` | W2 | finance | N | `GET /api/admin/reports/yoco-reconciliation` | |
| 36 | `/admin/users` | W3 | users_trust | Y | `GET /api/admin/users`, `POST .../bulk`, `PUT .../role`, `PATCH ...`, `DELETE ...`, export | |
| 37 | `/admin/users/[id]` | W3 | users_trust | N | `GET .../users/:id`, bookings, password, impersonate, export, `GET .../wallet-transactions` | Modal + page variants |
| 38 | `/admin/verifications` | W3 | users_trust | Y | `GET /api/admin/verifications` (+ actions) | |
| 39 | `/admin/audit-logs` | W3 | users_trust | Y | `GET /api/admin/audit-logs`, export | |
| 40 | `/admin/content` | W3 | content_catalog | Y | Broad: catalog/content endpoints (many `GET/POST/PATCH/DELETE` under `/api/admin/content`, `/api/admin/catalog`, media) | Highest API surface area |
| 41 | `/admin/content/learning` | W3 | content_catalog | Y | Learning center admin APIs | |
| 42 | `/admin/catalog` | W3 | content_catalog | Y | `GET/POST/PATCH /api/admin/catalog` (+ services/categories) | |
| 43 | `/admin/explore` | W3 | content_catalog | Y | Via `ExploreModerationTable`: `GET/PATCH/POST /api/admin/explore/posts` | |
| 44 | `/admin/addons` | W3 | content_catalog | N | `GET/POST/PUT/DELETE /api/admin/addons`, `GET /api/admin/catalog/services` | Not in sidebar |
| 45 | `/admin/ecommerce/orders` | W3 | ecommerce | Y | `GET /api/admin/ecommerce/orders` | |
| 46 | `/admin/ecommerce/returns` | W3 | ecommerce | Y | `GET /api/admin/ecommerce/returns` | |
| 47 | `/admin/ecommerce/products` | W3 | ecommerce | Y | `GET /api/admin/ecommerce/products` | |
| 48 | `/admin/promotions` | W4 | marketing_comms | Y | `GET/POST/PATCH/DELETE /api/admin/promotions` | |
| 49 | `/admin/loyalty` | W4 | marketing_comms | Y | `GET/POST/PUT/DELETE /api/admin/loyalty/rules`, `.../milestones` | |
| 50 | `/admin/gamification/point-rules` | W4 | marketing_comms | Y | `GET/PATCH /api/admin/gamification/point-rules` | |
| 51 | `/admin/gamification/badges` | W4 | marketing_comms | Y | `GET/POST/PATCH/DELETE .../gamification/badges`, `PUT .../gamification/backfill/initialize` | |
| 52 | `/admin/gift-cards` | W4 | marketing_comms | Y | `GET/POST/PATCH /api/admin/gift-cards` | |
| 53 | `/admin/notifications` | W4 | marketing_comms | Y | `GET/POST/PUT/DELETE .../notifications/templates`, logs, `POST .../send`, `GET .../users/search` | |
| 54 | `/admin/broadcast` | W4 | marketing_comms | Y | `GET/POST/PATCH /api/admin/broadcast` (+ related) | |
| 55 | `/admin/automations` | W4 | marketing_comms | Y | `GET/POST /api/admin/automations` | |
| 56 | `/admin/notification-templates` | W4 | marketing_comms | Y | Template CRUD under `/api/admin/notification-templates` | |
| 57 | `/admin/sms-templates` | W4 | marketing_comms | R | — | Redirect → notification-templates |
| 58 | `/admin/email-templates` | W4 | marketing_comms | R | — | Redirect → notification-templates |
| 59 | `/admin/webhooks` | W4 | integrations_dev | Y | `GET/POST/PATCH/DELETE /api/admin/webhooks` | |
| 60 | `/admin/api-keys` | W4 | integrations_dev | Y | `GET/POST/DELETE /api/admin/api-keys` | |
| 61 | `/admin/integrations/amplitude` | W4 | integrations_dev | Y | `GET/PUT /api/admin/integrations/amplitude` | |
| 62 | `/admin/mapbox` | W4 | integrations_dev | Y | `GET/PUT /api/admin/mapbox/config`, legacy zones tab | |
| 63 | `/admin/iso-codes` | W4 | integrations_dev | Y | `GET/PUT/POST/DELETE /api/admin/iso-codes/*` | |
| 64 | `/admin/settings/integrations/analytics` | W4 | integrations_dev | R | — | Client redirect → amplitude page |
| 65 | `/admin/service-zones` | W4 | operations | Y (`admin_operations` + superadmin; APIs: `ADMIN_SECTION_OPERATIONS`) | `GET/POST/PATCH/DELETE .../service-zones`, map layers, include/exclude, publish, areas/search | |
| 66 | `/admin/system-health` | W4 | operations | Y | `GET /api/admin/system-health` | |
| 67 | `/admin/monitoring` | W4 | operations | Y | `GET /api/admin/monitoring` | |
| 68 | `/admin/security` | W4 | operations | Y | Security admin API family | |
| 69 | `/admin/settings` | W5 | platform_config | Y | `GET/PATCH /api/admin/settings`, `PATCH /api/admin/travel-fees`, ISO code lookups | |
| 70 | `/admin/settings/tenant-domains` | W5 | platform_config | Y (superadmin only) | `GET/PATCH/POST/DELETE /api/admin/tenant-domains`, `POST /api/admin/tenants`, ISO lookups | |
| 71 | `/admin/settings/referrals` | W5 | platform_config | Y | `GET/PATCH /api/admin/referrals`, FAQs CRUD | |
| 72 | `/admin/settings/app-version` | W5 | platform_config | Y | `GET/PATCH /api/admin/app-version` | |
| 73 | `/admin/settings/feature-flags` | W5 | platform_config | Y | Via `@/lib/feature-flags` → `GET/POST/PATCH/DELETE /api/admin/feature-flags` | **Parallel** to control-plane flags UI |
| 74 | `/admin/settings/team-permissions` | W5 | platform_config | Y (superadmin only) | `GET /api/admin/settings/section-permissions`, `PUT` same (matrix editor) | |
| 74b | `/admin/settings/admin-team` | W5 | platform_config | Y (superadmin only) | `GET/POST /api/admin/settings/admin-team`, `PATCH/DELETE /api/admin/settings/admin-team/[id]` | List platform admins, invite by email, change role, deactivate, remove access |
| 75 | `/admin/custom-fields` | W5 | platform_config | Y | `GET/POST/PATCH/DELETE /api/admin/custom-fields` | |
| 76 | `/admin/control-plane` | W5 | platform_config | N | — | Redirect → `/admin/control-plane/overview` (no SPA page needed) |
| 77 | `/admin/control-plane/overview` | W5 | platform_config | Y | — | Card hub only |
| 78 | `/admin/control-plane/feature-flags` | W5 | platform_config | Y | `GET /api/admin/feature-flags`, `POST /api/admin/control-plane/flags-preview` | List + resolver preview |
| 79 | `/admin/control-plane/integrations` | W5 | platform_config | Y | — | Card hub (links to sumsub/gemini/aura/mapbox/settings/amplitude) |
| 80 | `/admin/control-plane/integrations/sumsub` | W5 | platform_config | Y | `GET/PUT .../control-plane/integrations/sumsub` | |
| 81 | `/admin/control-plane/integrations/gemini` | W5 | platform_config | Y | `GET/PUT .../gemini` | |
| 82 | `/admin/control-plane/integrations/aura` | W5 | platform_config | Y | `GET/PUT .../aura` | |
| 83 | `/admin/control-plane/modules/ads` | W5 | platform_config | Y | `GET/PUT .../modules/ads`, `GET/POST/DELETE .../modules/ads/packs` | |
| 84 | `/admin/control-plane/modules/on-demand` | W5 | platform_config | Y | `GET/PUT .../on-demand` | |
| 85 | `/admin/control-plane/modules/ai` | W5 | platform_config | Y | `GET/PUT .../modules/ai` | |
| 86 | `/admin/control-plane/modules/ai/templates` | W5 | platform_config | Y | `GET/POST/PATCH/DELETE .../ai/templates`, `.../ai/templates/[id]` | Full CRUD |
| 87 | `/admin/control-plane/modules/ai/entitlements` | W5 | platform_config | Y | `GET/POST .../entitlements` | |
| 88 | `/admin/control-plane/modules/ai/usage` | W5 | platform_config | Y | `GET .../usage` | |
| 89 | `/admin/control-plane/modules/ranking` | W5 | platform_config | Y | `GET/PUT .../ranking`, `POST /api/admin/ranking/recompute` | Weights editor + full recompute |
| 90 | `/admin/control-plane/modules/ranking/scores` | W5 | platform_config | Y | `GET /api/admin/ranking/scores` | Provider score table + per-provider recompute |
| 91 | `/admin/control-plane/modules/distance` | W5 | platform_config | Y | `GET/PUT .../distance` | |
| 92 | `/admin/control-plane/modules/safety` | W5 | platform_config | Y | `GET/PUT .../safety` | |
| 93 | `/admin/control-plane/safety-logs` | W5 | platform_config | Y | `GET /api/admin/safety/logs` | Read-only, filtered by event type |
| 94 | `/admin/control-plane/maintenance` | W5 | platform_config | Y | `GET/PATCH /api/admin/maintenance` | Per-scope config + enable/disable + countdown |
| 95 | `/admin/control-plane/maintenance/sign-ups` | W5 | platform_config | Y | `GET /api/admin/maintenance-notify` | Read-only list + CSV export, filtered by scope |
| 96 | `/admin/control-plane/audit-log` | W5 | platform_config | Y | `GET /api/admin/control-plane/config-change-log` | Paginated, filtered by area + record key |

---

## 5. Page matrix — template (copy per page for `Reviewed` depth)

| Field | Value |
|-------|--------|
| **Legacy page** | `/admin/...` |
| **Wave** | W0–W5 |
| **Owner** | @handle |
| **Responsive class** | M1 / M2 / M3 / M4 |
| **APIs** | (table below) |

### APIs for this page

| # | Method | Path | Section/role | Pagination/filters | Response type | Errors | Gap? |
|---|--------|------|--------------|-------------------|---------------|--------|------|
| 1 | | | | | | | |

**Parity notes:** (screenshots, edge cases, known legacy bugs to preserve or fix intentionally)

**Sign-off:** FE ___ BE ___ PM ___ Date ___

---

## 6. Contract testing linkage

Follow the layered approach in [`ADMIN_API_CONTRACT_GUIDELINES.md`](./ADMIN_API_CONTRACT_GUIDELINES.md) §8 (taxonomy CI, Zod + fixtures, route tests, optional staging/OpenAPI).

For each `Reviewed` API used by SPA, add one of:

- Zod schema in `packages/admin-api-client/src/schemas/...` + unit test with fixture JSON, or  
- OpenAPI operationId + CI schemathesis job (staging).

Record the test **id** in the **Client method** column. **Envelope:** fixtures MUST match `{ data, error }` once the route is migrated; until then, note `legacy shape` in the **Response notes** column.

---

## 7. Known legacy issues to resolve during migration

| Issue | Current behavior | Target |
|-------|------------------|--------|
| Dashboard vs `GET /api/admin/dashboard` | UI may diverge from API section matrix | Align UI + SPA with `ADMIN_SECTION_OVERVIEW` and matrix |
| Nav counts for non-platform roles | `nav-counts` gated as platform_config; sidebar still fetches | Partial counts, gated fetch, or skip without silent failure |
| Duplicate feature-flag admin surfaces | `/admin/settings/feature-flags` (lib) vs `/admin/control-plane/feature-flags` | Single product story + matrix rows for both until consolidated |
| **Raw JSON admin responses** | Many routes omit `{ data, error }`; errors sometimes plain `{ error: string }` | Migrate to `successResponse` / `errorResponse` per contract guidelines |
| **Pagination dialects** | `page`/`limit` vs `offset`/`limit`; inconsistent `meta` | Standardize per §4 of contract guidelines when touching lists |
| **`GET /api/admin/bookings` scale** | Can return large arrays for active tenants | Server-side pagination + filters documented in matrix |
| **Support tickets API shape** | `GET` returns `{ tickets, total, limit, offset }` without envelope | Align with SPA client + envelope when coordinated |

---

## 8. Implementation Delta

| Date | Note |
|------|------|
| 2026-04-06 | **Bootstrap** `GET /api/admin/bootstrap` implemented (`apps/web/src/app/api/admin/bootstrap/route.ts`) with `@beautonomi/admin-api-client` consumer + Vitest. **Superadmin tenant list:** `GET /api/admin/tenants` added for scope UI parity. **Wave 0 SPA** `apps/admin-web` uses shared `@beautonomi/admin-access` + `@beautonomi/admin-api-client` (scope keys match `fetcher.ts`). Taxonomy regeneration: **241** rows in `docs/admin-api-route-taxonomy.csv` (server route inventory; still **96** admin `page.tsx` routes). |
| 2026-04-06 | **Strict review:** Unauthenticated bootstrap returns **401** (route special-case; global `handleApiError` still maps `Authentication required` → **403** elsewhere). **`createAdminApiClient`** parses nested `{ error: { message } }` from `successResponse`/`errorResponse` envelopes. **Scope parity:** `withAdminScopeUrl` matches `fetcher` for **GET** only; **POST/PUT/PATCH** body injection for scoped admin URLs remains **Next `fetcher` only** until SPA mutates those endpoints (document before W3+ content/settings work). |
| 2026-04-07 | **Wave 0 verification:** Global search result links aligned with legacy `AdminShell` list URLs + `?highlight=`; section-permissions load failure surfaced with retry banner; dashboard load error includes **Retry**. See [`ADMIN_WAVE0_VERIFICATION_REPORT.md`](./ADMIN_WAVE0_VERIFICATION_REPORT.md). |
| 2026-04-07 | **Wave 1 pattern set:** `@beautonomi/admin-api-client` gains `postJson` / `patchJson` (non-GET paths skip scope query injection per `adminScope.ts`). `GET /api/admin/providers` includes distance fields for distance-settings parity. SPA routes: `support-tickets`, `bookings`, `bookings/:id`, `disputes`, `providers/distance-settings`. See [`ADMIN_WAVE1_PATTERN_SET_REPORT.md`](./ADMIN_WAVE1_PATTERN_SET_REPORT.md). |
| 2026-04-07 | **Taxonomy / CI:** Regenerated `docs/admin-api-route-taxonomy.csv` (**259** rows) so every `apps/web/.../api/admin/**/route.ts` is listed; unblocks `check-admin-api-routes-in-taxonomy.mjs` after new routes (ads, compliance, ecommerce catalog/overview, explore comments, gamification backfill init, loyalty rules by id, pricing-plan features, product-orders by id, provider-subscriptions by id, referral-sources, support-tickets upload). |
| 2026-04-07 | **SPA audit inventory:** Added [`ADMIN_SPA_AUDIT_INVENTORY.md`](./ADMIN_SPA_AUDIT_INVENTORY.md) — nav vs `App.tsx` inverse (deep links), global search paths, superadmin code verification + **staging checklist**, page→API summary by area. **Gaps called out:** taxonomy-only routes (e.g. compliance purge) without SPA consumers; optional nav for `addons` / `providers/distance-settings`. |
| 2026-04-07 | **Gap closure:** SPA [`CompliancePurgePage`](../../apps/admin-web/src/routes/control-plane/CompliancePurgePage.tsx) at `/admin/control-plane/compliance` (`useSuperadminPage`) + nav + regression critical flow; legacy Next [`app/admin/control-plane/compliance/page.tsx`](../../apps/web/src/app/admin/control-plane/compliance/page.tsx) + `AdminShell` / control-plane nav. Sidebar adds **Provider distance**, **Add-ons**, **Compliance purge** (superadmin). |
| 2026-04-07 | **Fees SPA parity:** [`FeesConfigsPage`](../../apps/admin-web/src/routes/finance/FeesConfigsPage.tsx) replaces read-only configs table with **Configurations | Adjustments | Reconciliations** (`adminQueryKeys.fees.configs` / `adjustmentsList` / `reconciliationsList`). API: `GET ?active_only=false` + `POST`/`PATCH` configs; `GET` adjustments/reconciliations with `meta`; `POST` adjustments; `POST`/`PATCH` reconciliations. Closes gap vs legacy [`app/admin/fees/page.tsx`](../../apps/web/src/app/admin/fees/page.tsx) (legacy adjustment/reconciliation create modals were not wired). |
| 2026-04-07 | **Dashboard decision-ready:** `GET /api/admin/dashboard` adds `generated_at`, `customer_count_uses_fallback`, `customer_signups_this_month` / `_last_month`, and expanded `metrics_notes` (fallback basis, bookings/providers growth). SPA [`DashboardPage`](../../apps/admin-web/src/routes/DashboardPage.tsx): correct **Market customers (distinct)** labelling vs `total_users`, methodology `<details>`, fallback warning (migration **446**), per-metric **deep links**, **Refresh** + “as of” time. Pairs with RPC `admin_dashboard_tenant_customer_count`. |
| 2026-04-08 | **Taxonomy / CI:** Added `docs/admin-api-route-taxonomy.csv` rows for `GET /api/admin/dashboard/marketing-insights` (superadmin + tenant scope; RPCs **447–448**) and `GET /api/admin/users/[id]/wallet-transactions` (`ADMIN_SECTION_USERS_TRUST`). SPA: [`DashboardPage`](../../apps/admin-web/src/routes/DashboardPage.tsx), [`UserDetailPage`](../../apps/admin-web/src/routes/users/UserDetailPage.tsx). §4 rows 3 + 37 updated. |
| 2026-04-07 | **Users / staff / providers SPA parity:** [`UsersListPage`](../../apps/admin-web/src/routes/users/UsersListPage.tsx) — signup-source filter, full role filter, page size 50, row selection + bulk activate/deactivate/delete (`POST /api/admin/users/bulk`), suspend/reactivate, superadmin quick role + compliance purge modal + create user (`POST /api/admin/users`); fixed list links via `adminSpaTo`. [`StaffListPage`](../../apps/admin-web/src/routes/staff/StaffListPage.tsx) — API filters, stats cards, search, edit modal (`PATCH /api/admin/staff/:id`), activate/deactivate, password reset, provider deep links. [`ProvidersListPage`](../../apps/admin-web/src/routes/providers/ProvidersListPage.tsx) — correct provider detail `Link` under `/admin` basename. E-commerce nav adds **Add-ons** → `/admin/addons`. |
| 2026-04-05 | **Waves 2–5 SPA batch:** `getRawJson` on `@beautonomi/admin-api-client` for top-level `{ data, meta }` envelopes. `apps/admin-web` adds read/list routes for finance, reports (`/reports/:reportKey`, API AuthZ **overview**), users trust, ecommerce (orders/returns; products via **public** API), marketing subset, integrations subset, operations JSON snapshots, platform settings subset, control-plane hub + redirects. **Known gaps:** report CSV export contract, platform-fees section vs nav, reports vs finance roles — see [`ADMIN_WAVES_2_TO_5_PROGRESS_REPORT.md`](./ADMIN_WAVES_2_TO_5_PROGRESS_REPORT.md). |

---

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | **Contract program:** Added [`ADMIN_API_CONTRACT_GUIDELINES.md`](./ADMIN_API_CONTRACT_GUIDELINES.md); §1.1 API audit summary; §6/§7 updates for envelopes, pagination, bookings scale, support-tickets shape. |
| 2026-04-05 | Seeded shell rows, section table, 96-route API index from repo |
| 2026-04-06 | Shell rows updated for SPA client methods; §8 Implementation Delta; changelog renumbered to §9 |
| 2026-04-07 | §8 Wave 0 verification delta; link to `ADMIN_WAVE0_VERIFICATION_REPORT.md` |
| 2026-04-07 | §4 notes rows 7,11,13,14,16; §8 Wave 1 pattern set; `ADMIN_WAVE1_PATTERN_SET_REPORT.md` |
| 2026-04-07 | §1.1 inventory **259** routes; §8 taxonomy regen delta (admin-api CSV + CI guardrail) |
| 2026-04-08 | §1.1 inventory **261** routes; marketing-insights + wallet-transactions taxonomy rows + §4 dashboard / user detail |
| 2026-04-07 | §1 process note: SPA grep + link to `ADMIN_SPA_AUDIT_INVENTORY.md`; §8 audit inventory delta |
| 2026-04-07 | §8/§9: compliance purge SPA + legacy parity; nav items for distance-settings, addons, compliance |
| 2026-04-07 | §8: users/staff/providers SPA parity batch (bulk users, purge modal, create user, staff CRUD + reset password, provider list links, Add-ons nav) |
| 2026-04-07 | §4 row 21 fees APIs + SPA note; §8 fees SPA parity delta |
| 2026-04-07 | §8 dashboard API + SPA decision-support delta |
| 2026-04-05 | §8 Waves 2–5 SPA batch delta; link to `ADMIN_WAVES_2_TO_5_PROGRESS_REPORT.md`; test strategy §2.7 envelope note |
| 2026-04-06 | **SPA sweep:** W1 list/detail read routes, W3 content surfaces, W4 marketing/integrations/ops lists, W5 control-plane `*` legacy bridge, **payout** mutation parity in SPA; `/admin/broadcast` SPA = **history** only (compose stays legacy). |
