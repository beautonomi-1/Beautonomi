# Wave 0 verification report (admin SPA foundation)

**Date:** 2026-04-07  
**Scope:** `apps/admin-web` Wave 0 shell + auth + dashboard/analytics/gods-eye/reports hub vs planning artifacts.  
**Method:** Static review of implementation against [`ADMIN_SPA_MIGRATION_PLAN_V2.md`](./ADMIN_SPA_MIGRATION_PLAN_V2.md), [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md), [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md), [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md), [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md), [`ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`](./ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md), [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), and parity with `apps/web` `AdminShell` / admin APIs.

---

## 1. Verified areas

| Area | Evidence |
|------|----------|
| **Routing + base path** | React Router `basename="/admin"`, Vite `base: '/admin/'`, index → `dashboard`, W1+ → `WavePlaceholderPage` with legacy link. |
| **Shell layout** | `AdminChrome`: sidebar, header, `main` wrapped with `max-w-[1600px] mx-auto` — matches UI conventions §1 max width intent. |
| **Auth / bootstrap** | Cookie `credentials: 'include'`, `GET /api/admin/bootstrap` with **401** for unauthenticated (route special-case), `RequireAuth` → login with **`?next=`** full `/admin/...`, **403** → not-admin copy. |
| **Section permissions** | `GET .../section-permissions`, **5m** stale; drives `canAccess` via `@beautonomi/admin-access`. **Retry banner** when load fails (post-fix). |
| **Superadmin scope** | localStorage keys + tenant dropdown; matches `admin-api-client` GET scope injection list vs `fetcher.ts`. |
| **Nav filtering** | `NAV_GROUPS` + `canAccess(section)` + `superadminOnly`; aligns with matrix section model. |
| **Nav counts** | Fetches `/api/admin/nav-counts`; **401/403 → `{}`** (no misleading badges); keys match API (`/admin/...` hrefs). Known **matrix-documented** AuthZ mismatch (platform_config gate vs mixed audiences) unchanged. |
| **Global search** | Same API and **legacy parity for result links** (`/admin/users?highlight=`, bookings/providers — matches `AdminShell`). **Click-outside** closes dropdown (post-fix). |
| **Activity API** | Consumes `{ activities }` shape returned by `GET /api/admin/activity`. |
| **Deployment doc** | Vite proxies `/api` + `/auth`; prod still Next-only until cutover — documented. |
| **noindex** | `index.html` meta robots. |
| **Sentry** | Optional `@sentry/react` init when `VITE_SENTRY_DSN` set; ErrorBoundary capture. |

---

## 2. Failed or partial areas

| Area | Severity | Detail |
|------|----------|--------|
| **Matrix shell rows** | **Partial** | §3 rows largely **In review**; only bootstrap marked **Reviewed**. FE+BE sign-off incomplete per migration plan §6. |
| **E2E / smoke automation** | **Partial** | Test strategy §2.1–2.2 **not** implemented as CI/nightly jobs; no Playwright `admin-smoke` in repo for Wave 0. |
| **Integration tests (MSW)** | **Partial** | Strategy recommends router + shell + mocked API; not present. |
| **Loading UX** | **Partial** | UI conventions §8 prefer **skeletons**; `RequireAuth`, dashboard, and several surfaces still use text spinners (“Loading…”). |
| **Analytics / Gods Eye parity** | **Partial** | SPA versions are **thin** vs legacy (charts/maps/export); acceptable as scaffold but **not** parity-signed. |
| **Activity / notifications UX** | **Partial** | SPA uses `<details>` vs legacy rich dropdown; matrix notes gap. |
| **Preview / production SPA host** | **Partial** | CI builds `admin-web`; **no** staging URL that serves SPA as production-shaped same-origin admin yet (cutover program). |
| **Unit test depth** | **Partial** | `cn` + search legacy path helper tests; **no** router/bootstrap/AdminChrome tests. |
| **POST scope on mutating APIs** | **Partial** | `admin-api-client` mirrors fetcher for **GET** only; safe for W0 reads; **documented** risk for later waves (matrix Implementation Delta). |

---

## 3. Blockers

### Critical (for calling Wave 0 “production-verified”)

1. **Shell matrix §3 → Reviewed** with FE+BE sign-off (or explicit waived rows with owner + date).  
2. **Objective smoke + RBAC** per test strategy (manual runbook minimum, or automated smoke on staging).  
3. **G2 / auth decision** approval posture for production (or written interim for internal-only preview).

### High

4. **Nav-counts AuthZ** vs sidebar audiences — resolve or accept with product sign-off (matrix §7).  
5. **Staging preview** that serves built SPA same-origin with Next API (optional for W1 dev, **required** before cutover).

### Medium

6. Skeleton loading for shell and dashboard reference page.  
7. Vitest stability for `apps/web` API tests (environment noise) if bootstrap regressions must be gated in web package.

---

## 4. Remediation applied in this verification pass (high-confidence code)

- **Global search:** Result links use SPA detail paths via `adminSearchResultSpaPath`; restored secondary lines (email/phone, owner, date).  
- **Search UX:** Document **mousedown** outside closes dropdown.  
- **Section permissions:** Expose load **failure** + **Retry** banner (avoid silent fallback confusion).  
- **Dashboard errors:** **Retry** control on load failure (UI conventions §8).  
- **Tests:** `adminSearchResultSpaPath` unit tests.  
- **Docs:** This report; matrix Implementation Delta row (below).

---

## 5. Go / no-go for starting Wave 1

**Recommendation: CONDITIONAL NO-GO** for **Wave 1 SPA page implementation** until:

1. **§3 shell matrix** rows are **Reviewed** (or EM-approved exceptions documented).  
2. A **recorded smoke pass** (checklist or ticket): login → bootstrap → dashboard + one superadmin-only page + search click-through to legacy target.  
3. **G2** stance decided for your environment (even “internal only until Security week X”).

**GO** for **parallel non-blocking** work: matrix §5 deep dives for W1 rows, `admin-api-client` method stubs, shared table primitives — per [`ADMIN_WAVE1_EXECUTION_CHECKLIST.md`](./ADMIN_WAVE1_EXECUTION_CHECKLIST.md).

---

## 6. Exact remediation items if Wave 1 must not start yet

| # | Owner | Action |
|---|-------|--------|
| R1 | FE + BE | Complete **Reviewed** sign-off for matrix §3 shell rows (or defer rows with matrix + tracker entry). |
| R2 | QA + FE | Run and attach evidence for **admin-smoke**-equivalent manual pass on Vite+Next dev (or staging when available). |
| R3 | Security + EM | Close or defer **G2** with written note in `ADMIN_SPA_AUTH_DECISION.md` §9. |
| R4 | FE | Replace spinners with **skeletons** on shell + dashboard (UI conventions §8). |
| R5 | Platform | Add **staging** job or doc path for **preview** static admin bundle + Next API (deployment model §3). |
| R6 | FE | Add **MSW** or minimal router integration test for `RequireAuth` + bootstrap (test strategy §1). |
| R7 | BE + PM | Decide **nav-counts** policy for non–platform_config roles (matrix §7). |

---

## 7. Document control

| Date | Change |
|------|--------|
| 2026-04-07 | Initial Wave 0 verification + remediation notes. |
