# ADMIN_SPA_WAVE_TRACKER

**Purpose:** **Living** inventory of every admin page with migration status, ownership, responsive class, and **explicit parity sign-off**.

**Owner:** EM or PM (keeps current); page **Owner** responsible for row accuracy.

**Update rule:** Every PR that migrates or touches a page **must** update this file in the same PR.

**Seed:** 96 `page.tsx` files under `apps/web/src/app/admin` (2026-04-05). **Matrix ref** points to row # in `ADMIN_API_PARITY_MATRIX.md` §4.

**Post-migration snapshot (2026-04-07):** Full SPA route set is implemented in `apps/admin-web` for all 96 matrix rows (**read surfaces**, **redirects**, or **legacy bridge**). Table **Status** = **`Migrated (SPA)`** = primary UI or redirect exists in the SPA; it is **not** **`Parity signed`** (QA + FE) and not production cutover sign-off — see [`ADMIN_POST_MIGRATION_REVIEW.md`](./ADMIN_POST_MIGRATION_REVIEW.md), [`ADMIN_CUTOVER_READINESS_REPORT.md`](./ADMIN_CUTOVER_READINESS_REPORT.md) (changelog amendment), and the explicit checklist in [`ADMIN_SPA_COMPLETION_STATUS.md`](./ADMIN_SPA_COMPLETION_STATUS.md).

**Cutover wiring (2026-04-07):** Production **default** remains **Next legacy** admin until **`ADMIN_SPA_ROUTING=spa`** is set on deploy. Implementation: `public/admin` sync + `proxy.ts` rewrite — see [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md) and [`ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`](./ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md).

**Legacy decommission (2026-04-07):** Next **`app/admin/**`** and **`components/admin/*`** (except moved **ImpersonationBanner**) **remain** for **`ADMIN_SPA_ROUTING=legacy`** rollback. **Do not delete** until cutover plan §8 milestone. Inventory + safe removals: [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md). Risk: **R24** (dual UI too long).

**Foundation (2026-04-05 onward):** TanStack Query keys (`adminQueryKeys`), RBAC hooks (`useAdminSectionPage` / `useSuperadminPage`), shared UI (`AdminPageSkeleton`, `AdminRetryBlock`, `AdminModal`, `AdminMutationAlert`, `AdminQueryBlock`, `AdminDataList`), `isAdminApiAuthFailure`. References: [`ADMIN_FOUNDATION_HARDENING_REPORT.md`](./ADMIN_FOUNDATION_HARDENING_REPORT.md), `ADMIN_SPA_UI_CONVENTIONS.md` §14.

**Production stabilization (2026-04-05):** Session/login edge hardening, shell soft-degrade for **nav-counts** / **activity**, **`adminApi.downloadBlob`** for CSV exports, Sentry noise reduction, default **mutation retry off** — [`ADMIN_PRODUCTION_STABILIZATION_REPORT.md`](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md). Risk register **R12** / **R22** / **R23** mitigations updated (still **Open** where synthetics / matrix work remains).

**Long-term governance (2026-04-05):** Ownership, reviews, API change process, release/incident playbooks — [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md). PRs that touch admin routes must update this tracker per governance **§8**.

**Waves 2–5 + completion sweep:** Finance, reports (overview AuthZ), users/trust, ecommerce lists, marketing/integrations/ops/settings/control-plane — see [`ADMIN_WAVES_2_TO_5_PROGRESS_REPORT.md`](./ADMIN_WAVES_2_TO_5_PROGRESS_REPORT.md). **Broadcast:** SPA **hub** at `/broadcast`, **history** at `/broadcast/history`, **compose** → legacy.

---

## Status values

| Status | Meaning |
|--------|---------|
| `Not started` | Matrix row not complete |
| `Blocked` | Dependency (API, design, auth) — note in **Blocker** column |
| `In progress` | Active branch |
| `In review` | PR open |
| `Migrated (SPA)` | Primary route exists in `apps/admin-web` (or redirect/legacy bridge); **parity QA may still be open** |
| `Done` | Merged + meets DoD from `ADMIN_SPA_TEST_STRATEGY.md` |
| `Parity signed` | QA + FE owner signed |

**Rule:** Wave **N+1** page may enter `In progress` only if Wave **N** exit criteria met (see `ADMIN_SPA_MIGRATION_PLAN_V2.md`) — **exception** requires EM written approval.

---

## Responsive classes (M1–M4)

| Class | Typical UI |
|-------|------------|
| M1 | Hub / few links, minimal data density |
| M2 | Standard tables, forms, filters |
| M3 | Multi-panel, tabs, heavy modals |
| M4 | Maps, large charts, map + table split |

---

## Tracker table

| Legacy path | Wave | Nav | Responsive | Status | Matrix §4 | Blocker | QA sign-off | Date |
|-------------|------|-----|------------|--------|-----------|---------|-------------|------|
| `/admin` | W0 | N | M1 | Migrated (SPA) | 1 | SPA `index` → `dashboard`; **W0 exit verify** ([checklist §0](./ADMIN_WAVE1_EXECUTION_CHECKLIST.md)) | | 2026-04-07 |
| `/admin/login` | W0 | N | M1 | Migrated (SPA) | 2 | SPA + `POST /api/auth/sign-in` + bootstrap; prod still Next | | 2026-04-07 |
| `/admin/dashboard` | W0 | Y | M2 | Migrated (SPA) | 3 | SPA + `GET /api/admin/dashboard`; matrix shell row not fully **Reviewed** | | 2026-04-07 |
| `/admin/gods-eye` | W0 | Y | M4 | Migrated (SPA) | 4 | SPA superadmin-only; **M4** map parity vs legacy not signed | | 2026-04-07 |
| `/admin/analytics` | W0 | Y | M2 | Migrated (SPA) | 5 | SPA superadmin-only; export/charts parity vs legacy not signed | | 2026-04-07 |
| `/admin/reports` | W0 | Y | M1 | Migrated (SPA) | 6 | SPA hub links to `/reports/*` + legacy; row 30–35 detail in SPA | | 2026-04-07 |
| `/admin/support-tickets` | W1 | Y | M2 | Migrated (SPA) | 7 | SPA list + URL filters; row links to SPA detail | | 2026-04-07 |
| `/admin/support-tickets/[id]` | W1 | N | M2 | Migrated (SPA) | 8 | SPA JSON read + legacy mutations; matrix **Reviewed** gate | | 2026-04-06 |
| `/admin/providers` | W1 | Y | M2 | Migrated (SPA) | 9 | SPA list + link detail; verify/bulk legacy | | 2026-04-06 |
| `/admin/providers/[id]` | W1 | N | M3 | Migrated (SPA) | 10 | SPA JSON snapshot + legacy edit | | 2026-04-06 |
| `/admin/providers/distance-settings` | W1 | N | M2 | Migrated (SPA) | 11 | SPA table + PATCH modal; providers GET extended | | 2026-04-07 |
| `/admin/staff` | W1 | Y | M2 | Migrated (SPA) | 12 | SPA list + stats; PATCH legacy | | 2026-04-06 |
| `/admin/bookings` | W1 | Y | M2 | Migrated (SPA) | 13 | SPA list + bulk + export | | 2026-04-07 |
| `/admin/bookings/[id]` | W1 | N | M2 | Migrated (SPA) | 14 | SPA detail + PATCH + cancel/refund | | 2026-04-07 |
| `/admin/reviews` | W1 | Y | M2 | Migrated (SPA) | 15 | SPA list + pagination; moderation legacy | | 2026-04-06 |
| `/admin/disputes` | W1 | Y | M2 | Migrated (SPA) | 16 | SPA list + resolve (PATCH) | | 2026-04-07 |
| `/admin/user-reports` | W1 | Y | M2 | Migrated (SPA) | 17 | SPA list; resolve legacy | | 2026-04-06 |
| `/admin/refunds` | W1 | Y | M2 | Migrated (SPA) | 18 | SPA list; POST refund legacy | | 2026-04-06 |
| `/admin/finance` | W2 | Y | M2 | Migrated (SPA) | 19 | SPA summary; deep legacy | | 2026-04-05 |
| `/admin/payouts` | W2 | Y | M2 | Migrated (SPA) | 20 | SPA list + approve/reject/mark-paid/mark-failed/transfer | | 2026-04-06 |
| `/admin/fees` | W2 | Y | M2 | Migrated (SPA) | 21 | SPA configs list | | 2026-04-05 |
| `/admin/billing` | W2 | Y | M2 | Migrated (SPA) | 22 | SPA invoices list | | 2026-04-05 |
| `/admin/taxes` | W2 | Y | M2 | Migrated (SPA) | 23 | SPA read | | 2026-04-05 |
| `/admin/settings/platform-fees` | W2 | Y | M2 | Migrated (SPA) | 24 | SPA read; API = platform_config | | 2026-04-05 |
| `/admin/plans` | W2 | Y | M3 | Migrated (SPA) | 25 | SPA read list; CRUD legacy | | 2026-04-05 |
| `/admin/pricing-plans` | W2 | N | M1 | Migrated (SPA) | 26 | SPA redirect → `/plans` | | 2026-04-05 |
| `/admin/subscription-plans` | W2 | N | M3 | Migrated (SPA) | 27 | SPA redirect → `/plans` | | 2026-04-05 |
| `/admin/provider-subscriptions` | W2 | Y | M2 | Migrated (SPA) | 28 | SPA list | | 2026-04-05 |
| `/admin/subscription-revenue` | W2 | Y | M2 | Migrated (SPA) | 29 | SPA metrics | | 2026-04-05 |
| `/admin/reports/revenue` | W2 | N | M2 | Migrated (SPA) | 30 | SPA report; API AuthZ = overview | | 2026-04-05 |
| `/admin/reports/bookings` | W2 | N | M2 | Migrated (SPA) | 31 | SPA report; API AuthZ = overview | | 2026-04-05 |
| `/admin/reports/providers` | W2 | N | M2 | Migrated (SPA) | 32 | SPA report; API AuthZ = overview | | 2026-04-05 |
| `/admin/reports/customers` | W2 | N | M2 | Migrated (SPA) | 33 | SPA report; API AuthZ = overview | | 2026-04-05 |
| `/admin/reports/gift-cards` | W2 | N | M2 | Migrated (SPA) | 34 | SPA report; API AuthZ = overview | | 2026-04-05 |
| `/admin/reports/yoco-reconciliation` | W2 | N | M2 | Migrated (SPA) | 35 | SPA report; API AuthZ = overview | | 2026-04-05 |
| `/admin/users` | W3 | Y | M3 | Migrated (SPA) | 36 | SPA list + filters | | 2026-04-05 |
| `/admin/users/[id]` | W3 | N | M3 | Migrated (SPA) | 37 | SPA JSON read + legacy tools | | 2026-04-06 |
| `/admin/verifications` | W3 | Y | M2 | Migrated (SPA) | 38 | SPA list; actions legacy | | 2026-04-05 |
| `/admin/audit-logs` | W3 | Y | M2 | Migrated (SPA) | 39 | SPA list + CSV export | | 2026-04-05 |
| `/admin/content` | W3 | Y | M4 | Migrated (SPA) | 40 | SPA hub + legacy CMS | | 2026-04-06 |
| `/admin/content/learning` | W3 | Y | M3 | Migrated (SPA) | 41 | SPA articles list + legacy editor | | 2026-04-06 |
| `/admin/catalog` | W3 | Y | M2 | Migrated (SPA) | 42 | SPA services list + legacy CRUD | | 2026-04-06 |
| `/admin/explore` | W3 | Y | M2 | Migrated (SPA) | 43 | SPA posts list + legacy moderation | | 2026-04-06 |
| `/admin/addons` | W3 | N | M2 | Migrated (SPA) | 44 | SPA list + legacy CRUD | | 2026-04-06 |
| `/admin/ecommerce/orders` | W3 | Y | M2 | Migrated (SPA) | 45 | SPA list | | 2026-04-05 |
| `/admin/ecommerce/returns` | W3 | Y | M2 | Migrated (SPA) | 46 | SPA list | | 2026-04-05 |
| `/admin/ecommerce/products` | W3 | Y | M2 | Migrated (SPA) | 47 | SPA via **public** products API — matrix gap | | 2026-04-05 |
| `/admin/promotions` | W4 | Y | M2 | Migrated (SPA) | 48 | SPA list; CRUD legacy | | 2026-04-05 |
| `/admin/loyalty` | W4 | Y | M2 | Migrated (SPA) | 49 | SPA rules list + legacy edit | | 2026-04-06 |
| `/admin/gamification/point-rules` | W4 | Y | M2 | Migrated (SPA) | 50 | SPA list + legacy PATCH | | 2026-04-06 |
| `/admin/gamification/badges` | W4 | Y | M2 | Migrated (SPA) | 51 | SPA list + legacy CRUD | | 2026-04-06 |
| `/admin/gift-cards` | W4 | Y | M2 | Migrated (SPA) | 52 | SPA list | | 2026-04-05 |
| `/admin/notifications` | W4 | Y | M3 | Migrated (SPA) | 53 | SPA OneSignal config JSON; full hub legacy | | 2026-04-06 |
| `/admin/broadcast` | W4 | Y | M2 | Migrated (SPA) | 54 | SPA **hub**; compose → legacy; history → `/broadcast/history` | | 2026-04-07 |
| `/admin/automations` | W4 | Y | M2 | Migrated (SPA) | 55 | SPA list + legacy editor | | 2026-04-06 |
| `/admin/notification-templates` | W4 | Y | M2 | Migrated (SPA) | 56 | SPA list + legacy editor | | 2026-04-06 |
| `/admin/sms-templates` | W4 | N | M1 | Migrated (SPA) | 57 | SPA redirect → notification-templates | | 2026-04-05 |
| `/admin/email-templates` | W4 | N | M1 | Migrated (SPA) | 58 | SPA redirect → notification-templates | | 2026-04-05 |
| `/admin/webhooks` | W4 | Y | M2 | Migrated (SPA) | 59 | SPA endpoints list | | 2026-04-05 |
| `/admin/api-keys` | W4 | Y | M2 | Migrated (SPA) | 60 | SPA list | | 2026-04-05 |
| `/admin/integrations/amplitude` | W4 | Y | M2 | Migrated (SPA) | 61 | SPA read | | 2026-04-05 |
| `/admin/mapbox` | W4 | Y | M3 | Migrated (SPA) | 62 | SPA config JSON + legacy UI | | 2026-04-06 |
| `/admin/iso-codes` | W4 | Y | M2 | Migrated (SPA) | 63 | SPA tabbed lists + legacy CRUD | | 2026-04-06 |
| `/admin/settings/integrations/analytics` | W4 | N | M1 | Migrated (SPA) | 64 | SPA redirect → amplitude | | 2026-04-05 |
| `/admin/service-zones` | W4 | Y (superadmin) | M4 | Migrated (SPA) | 65 | SPA zones table; map legacy (M4) | | 2026-04-06 |
| `/admin/system-health` | W4 | Y | M2 | Migrated (SPA) | 66 | SPA JSON snapshot | | 2026-04-05 |
| `/admin/monitoring` | W4 | Y | M2 | Migrated (SPA) | 67 | SPA `monitoring/health` | | 2026-04-05 |
| `/admin/security` | W4 | Y | M2 | Migrated (SPA) | 68 | SPA read JSON | | 2026-04-05 |
| `/admin/settings` | W5 | Y | M3 | Migrated (SPA) | 69 | SPA read + raw JSON | | 2026-04-05 |
| `/admin/settings/tenant-domains` | W5 | Y (superadmin) | M3 | Migrated (SPA) | 70 | SPA superadmin list | | 2026-04-05 |
| `/admin/settings/referrals` | W5 | Y | M2 | Migrated (SPA) | 71 | SPA read | | 2026-04-05 |
| `/admin/settings/app-version` | W5 | Y | M2 | Migrated (SPA) | 72 | SPA read | | 2026-04-05 |
| `/admin/settings/feature-flags` | W5 | Y | M3 | Migrated (SPA) | 73 | SPA list | | 2026-04-05 |
| `/admin/settings/team-permissions` | W5 | Y (superadmin) | M2 | Migrated (SPA) | 74 | SPA read matrix; PUT legacy | | 2026-04-05 |
| `/admin/custom-fields` | W5 | Y | M2 | Migrated (SPA) | 75 | SPA → `/settings/custom-fields` | | 2026-04-05 |
| `/admin/control-plane` | W5 | N | M1 | Migrated (SPA) | 76 | SPA redirect → overview | | 2026-04-05 |
| `/admin/control-plane/overview` | W5 | Y | M2 | Migrated (SPA) | 77 | SPA hub + legacy deep links | | 2026-04-05 |
| `/admin/control-plane/feature-flags` | W5 | N | M3 | Migrated (SPA) | 78 | SPA titled legacy bridge | | 2026-04-06 |
| `/admin/control-plane/integrations` | W5 | N | M1 | Migrated (SPA) | 79 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/integrations/sumsub` | W5 | N | M2 | Migrated (SPA) | 80 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/integrations/gemini` | W5 | N | M2 | Migrated (SPA) | 81 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/integrations/aura` | W5 | N | M2 | Migrated (SPA) | 82 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ads` | W5 | N | M3 | Migrated (SPA) | 83 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/on-demand` | W5 | N | M2 | Migrated (SPA) | 84 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ai` | W5 | N | M2 | Migrated (SPA) | 85 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ai/templates` | W5 | N | M3 | Migrated (SPA) | 86 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ai/entitlements` | W5 | N | M2 | Migrated (SPA) | 87 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ai/usage` | W5 | N | M2 | Migrated (SPA) | 88 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ranking` | W5 | N | M2 | Migrated (SPA) | 89 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/ranking/scores` | W5 | N | M3 | Migrated (SPA) | 90 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/distance` | W5 | N | M2 | Migrated (SPA) | 91 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/modules/safety` | W5 | N | M2 | Migrated (SPA) | 92 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/safety-logs` | W5 | N | M2 | Migrated (SPA) | 93 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/maintenance` | W5 | N | M2 | Migrated (SPA) | 94 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/maintenance/sign-ups` | W5 | N | M2 | Migrated (SPA) | 95 | SPA legacy bridge | | 2026-04-06 |
| `/admin/control-plane/audit-log` | W5 | N | M2 | Migrated (SPA) | 96 | SPA legacy bridge | | 2026-04-06 |

**Nav:** `Y` = listed in `AdminShell` `navGroups`; `Y (superadmin)` = item has `superadminOnly`; `N` = not a sidebar entry (detail pages, control-plane children, redirects).

---

## Wave exit sign-off

Use [`ADMIN_WAVE1_EXECUTION_CHECKLIST.md`](./ADMIN_WAVE1_EXECUTION_CHECKLIST.md) §0 for **W0 verification** steps before checking W0 below.

| Wave | Exit criteria met | EM | QA | Date |
|------|-------------------|----|----|------|
| W0 | | ☐ | ☐ | |
| W1 | | ☐ | ☐ | |
| W2 | | ☐ | ☐ | |
| W3 | | ☐ | ☐ | |
| W4 | | ☐ | ☐ | |
| W5 | | ☐ | ☐ | |

---

## Spill / scope control

If work is **at risk** of crossing waves, open a **scope ticket**; EM decides **defer** or **absorb**. **No silent scope creep.**
