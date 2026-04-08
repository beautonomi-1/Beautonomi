# Admin SPA — post-migration regression, risk, and maintainability review

**Date:** 2026-04-07  
**Scope:** `apps/admin-web` (Vite + React Router), shared packages `@beautonomi/admin-access` / `@beautonomi/admin-api-client`, shell in `AdminChrome`, CI, and alignment with `ADMIN_API_PARITY_MATRIX.md`, `ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`, and [`ADMIN_CUTOVER_READINESS_REPORT.md`](./ADMIN_CUTOVER_READINESS_REPORT.md).  
**Code fixes in this pass:** Reports hub section gate, login `next` sanitization, catch-all copy, CI lint for `admin-web`, `.env.example`, risk register + wave tracker updates.

---

## 1. Executive summary

The SPA implements **all 96 legacy admin paths** as either a first-class route, a client redirect, or a **legacy bridge** (control-plane deep paths). Shared patterns (bootstrap, section RBAC hooks, TanStack Query keys, retry/skeleton UI) are **mostly consistent**. Remaining risk is concentrated in **production cutover** (hosting + `proxy.ts` static bypass), **parity/AuthZ documentation** (matrix still largely “In review”), **scoped superadmin GETs** vs **raw `fetch` on exports/public catalog**, and **observability** (optional Sentry). **Do not** treat “all routes exist” as “safe to cut over” — see cutover readiness report. **Follow-up stabilization (exports, shell noise, Sentry, session UX):** [`ADMIN_PRODUCTION_STABILIZATION_REPORT.md`](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md).

---

## 2. Auth / session

| Topic | Assessment |
|-------|------------|
| Bootstrap | `GET /api/admin/bootstrap` via `adminApi.getBootstrap()`; 401 → login; 403 → permission screen (`RequireAuth`). |
| Login `next` | **Fixed:** reject `..` / `.` path segments so `?next=` cannot drive open redirects within `/admin`. |
| Cookies | `credentials: "include"` on `adminApi`; sign-in via `/api/auth/sign-in` (see `authSignIn.ts`). Same-origin production model per `ADMIN_SPA_AUTH_DECISION.md` (still **Draft** until Security marks Approved). |
| Logout | Clears TanStack cache root (`adminQueryKeys.root`) + Supabase sign-out. |

**Residual risk:** Preview / multi-origin cookie behavior must be validated on **integrated** staging (R1).

---

## 3. Permissions / RBAC

| Topic | Assessment |
|-------|------------|
| Page gates | Widespread `useAdminSectionPage` / `useSuperadminPage` + `enabled: allowed` on queries — **good** coupling. |
| Reports hub | **Fixed:** `ReportsHubPage` now requires **`ADMIN_SECTION_OVERVIEW`**, matching `ReportDetailPage` + API AuthZ notes in the matrix (avoids deep-link UX where hub was visible without overview). |
| Section matrix load failure | `sectionPermissionsError` + refetch in shell; `canAccessSection` falls back to **`ADMIN_SECTION_ROLES`** when API missing — **documented risk** (R22): temporary **RBAC drift** vs DB. |
| Nav filtering | Sidebar uses `canAccess(section)`; superadmin-only items flagged in `nav.ts`. |

**Residual risk:** R5, R13 — E2E per role still recommended; matrix shell rows not all **Reviewed**.

---

## 4. Routes / deep links

| Topic | Assessment |
|-------|------------|
| Parity | `App.tsx` covers matrix rows including redirects (`pricing-plans`, `subscription-plans`, `sms-templates`, `email-templates`, `custom-fields`, `settings/integrations/analytics`, `control-plane` index). |
| Broadcast | `/broadcast` hub + `/broadcast/history`; nav still uses `/admin/broadcast` (basename → hub). |
| Catch-all | `WavePlaceholderPage` — **copy updated** to “no SPA route” (avoids false “Waves 1–5” message for typos). |
| Unknown paths | Still offer legacy link — may 404 if legacy removed post-cutover; acceptable until cutover cleanup. |

**Residual risk:** R4, R19 — bookmark E2E after cutover; server-side redirects must stay aligned if legacy removed.

---

## 5. Parity gaps (product + API)

Documented in matrix + wave tracker blockers (not exhaustive):

- **Reports:** SPA tables + CSV via `downloadAdminBlob`; chart/export parity vs legacy **unsigned**.
- **Gods Eye / analytics:** Map-heavy / export parity **deferred** (superadmin pages note legacy fallback).
- **Support tickets:** SPA JSON read; **mutations** still legacy.
- **E-commerce products:** Uses **`/api/public/products`** — matrix calls out gap vs admin-private contract.
- **Payouts / finance:** SPA mutations expanded; rich legacy flows may still differ.
- **Content / notifications / mapbox / ISO / service zones:** Mix of SPA read + **legacy CRUD / maps**.

---

## 6. API usage

| Pattern | Notes |
|---------|--------|
| `adminApi` | Default path; **GET** only applies `withAdminScopeUrl` (superadmin tenant scope) per `createAdminApiClient`. |
| Raw `fetch` | **`BookingsPage` export**, **`ProductCatalogPage` public list**, **`adminCsvDownload`** — bypass unified client (R23). Risk: scope query not applied to those URLs if later moved under scoped prefixes; error handling duplicated. |
| Envelopes | Comment in `adminClient.ts` documents `getRawJson` for `{ data, meta }`. |

**Remediation backlog:** Wrap exports/public catalog in shared helpers or extend `adminApi` with explicit non-scoped methods and document in matrix.

---

## 7. Loading / error UX

| Pattern | Coverage |
|---------|----------|
| `AdminRetryBlock` | Common on list/detail pages after auth check. |
| `AdminQueryBlock` | Dashboard, Gods Eye, etc. |
| `AdminPageSkeleton` | Many list pages during initial load. |
| `isAdminApiAuthFailure` | Used to map 401/403 to `PermissionDenied` where applied. |

**Gaps:** Inconsistent adoption on **every** page (acceptable technical debt); some pages use inline loading only — prioritize high-traffic surfaces if polishing.

---

## 8. Shared components / consistency

- **Lists:** Mix of `AdminDataList` (responsive cards) and `AdminDataTable` only — intentional gradual migration; increases visual/UX variance (R9).
- **Modals / mutations:** `AdminModal`, `AdminMutationAlert` appear on interactive pages (e.g. payouts, bookings) — not universal.
- **Headers:** `AdminPageHeader` + `AdminPanel` widely used — good.

---

## 9. Performance

| Topic | Assessment |
|-------|------------|
| Code splitting | Routes are **statically** imported in `App.tsx` — large **initial bundle** (R6). No route-based `React.lazy` observed. |
| Query defaults | Reasonable `staleTime` on bootstrap (2m) and section permissions (5m). |
| Nav counts / activity | Queries in shell; failures softened for nav-counts (401/403 → `{}`). |

**Stabilization recommendation:** Add lazy routes for **Gods Eye**, **reports**, **control-plane** after cutover stabilizes.

---

## 10. Deployment / maintainability

| Topic | Assessment |
|-------|------------|
| Vercel / Next integration | SPA **not** yet served from production `apps/web` host — see deployment model + cutover readiness (**Critical** gap). |
| `proxy.ts` | Must exempt **`/admin/assets/**`** before cutover (R21). |
| CI | **Updated:** `lint` now includes **`admin-web`** (was typecheck/build only). |
| Env | **`apps/admin-web/.env.example`** added; README remains canonical. |

---

## 11. Documentation drift

| Document | Drift / action |
|----------|----------------|
| `ADMIN_SPA_WAVE_TRACKER.md` | **Updated** to **post-migration snapshot**: all rows **`Migrated (SPA)`**; clarifies ≠ **Parity signed**. |
| `ADMIN_SPA_RISK_REGISTER.md` | **R21–R23** added from this review + cutover findings. |
| `ADMIN_API_PARITY_MATRIX.md` | Still authoritative for API **Reviewed** state — **not** bulk-edited in this pass. |
| `ADMIN_WAVE1_EXECUTION_CHECKLIST.md` etc. | May still say “not started” in places — treat **wave tracker header** + this review as **current** for route inventory. |

---

## 12. Cutover cleanup (still pending)

From cutover plan + readiness report (non-code):

- Implement Tier **A/B** kill switch and **N-1** deploy tagging discipline.
- Integrate `admin-web` **dist** into Next static hosting or CDN rewrites + **HTML** short TTL.
- **`proxy.ts`**: static asset bypass for SPA chunks.
- Staging **rollback drill** (twice) before prod.
- Remove or thin **`apps/web/src/app/admin/**`** only after **signed** milestone (≥2 weeks stable suggested).
- Purge / cache runbook for `/admin/*` (R15).

---

## 13. Remaining risks (prioritized)

1. **Cutover / edge (Critical):** R21, R3, R8 — hosting + rollback + static bypass.  
2. **Parity / AuthZ (High):** R2, R5, R13, R18 — matrix Reviewed + reports vs finance roles + dual feature-flag UIs.  
3. **Observability (High):** R12 — require `VITE_SENTRY_DSN` in staging/prod admin builds; synthetics for `/admin/login` + `/admin/dashboard`.  
4. **Scope / fetch (Medium):** R23 — exports + public catalog.  
5. **UX consistency (Medium):** R9, R6 — lazy loading + `AdminDataList` rollout.

---

## 14. Technical debt left **intentionally**

- **Legacy bridges** for control-plane and many “full CRUD” surfaces — product choice until parity signed.
- **Public products API** for admin catalog page — until admin-private API exists.
- **GET-only scope injection** in `admin-api-client` — POST body scope deferred per matrix §8.
- **No lazy routes** — faster to ship; bundle size trade accepted short term.
- **`WavePlaceholderPage`** legacy link — tolerable until legacy admin removed.

---

## 15. What to stabilize **next** (recommended order)

1. **Cutover infrastructure** + `proxy.ts` asset bypass + one staging environment where `/admin` is SPA-only.  
2. **Matrix shell rows → Reviewed** + contract tests for bootstrap, section-permissions, search.  
3. **Sentry + synthetic monitors** for admin SPA.  
4. **RBAC E2E** (finance vs overview for reports, support_agent vs admin_support for tickets).  
5. **Lazy-loaded routes** for heaviest pages after metrics baseline.

---

## 16. What **not** to touch immediately after cutover

- **Bulk delete** of `apps/web/src/app/admin/**`** until rollback window and sign-off (cutover plan §8).  
- **Rewriting** `ADMIN_SECTION_ROLES` defaults without coordinating **`@beautonomi/admin-access`** and Next re-export — single package is the source of truth.  
- **Consolidating** the two feature-flag UIs (R18) without PM + Security — risk of AuthZ regression.  
- **Large refactors** of `App.tsx` route tree — prefer additive fixes and lazy loading first.  
- **Changing** `withAdminScopeUrl` rules without updating **`fetcher.ts`** parity in `apps/web`.

---

## 17. Changelog

| Date | Change |
|------|--------|
| 2026-04-07 | Initial post-migration review; code fixes: reports hub RBAC, login `next` hardening, placeholder copy, CI lint + `.env.example`; docs: risk register R21–R23, wave tracker snapshot. |
