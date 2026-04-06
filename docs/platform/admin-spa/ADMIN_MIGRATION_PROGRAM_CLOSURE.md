# Admin migration program — executive closure summary

**Date:** 2026-04-05  
**Audience:** Engineering leadership, EM, Platform, Product, QA  
**Purpose:** Close the **admin migration program** as an engineering initiative and hand off to **steady-state platform operations**. This is not a claim that every product parity or operational gate is finished — those are tracked explicitly below and in linked artifacts.

**Sources:** [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md), [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md), [`ADMIN_PRODUCTION_STABILIZATION_REPORT.md`](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md), [`ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md`](./ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md), [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md), [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md), plus [`ADMIN_SPA_COMPLETION_STATUS.md`](./ADMIN_SPA_COMPLETION_STATUS.md) for gate honesty.

---

## 1. What was migrated

- **Scope:** All **96** legacy admin paths seeded from `apps/web/src/app/admin` are represented in the Vite SPA (`apps/admin-web`) as **first-class routes**, **client redirects**, or **legacy bridges** (e.g. control-plane deep links). Tracker status for each row: **`Migrated (SPA)`** — see [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md).
- **Shared backend:** Admin behavior continues to use **`/api/admin/*`** on the Next app; no parallel admin API was introduced for core flows.
- **RBAC alignment:** Section checks and nav patterns use **`@beautonomi/admin-access`**, shared HTTP patterns via **`@beautonomi/admin-api-client`**, with Next re-export for server code.
- **Cutover packaging:** SPA **`dist`** is synced into **`apps/web/public/admin/`** during the web production build (`sync-admin-spa.mjs`); **`public/admin`** is gitignored — [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md).

**Not the same as:** QA **Parity signed**, matrix **Reviewed** for all shell APIs, or “every screen pixel-matched to legacy” — many surfaces remain **read in SPA + mutate in legacy** per matrix and wave notes.

---

## 2. Architectural decisions implemented

| Decision | Implementation |
|----------|------------------|
| **Dedicated admin SPA** | `apps/admin-web` (React Router, TanStack Query, Vite), **`base: /admin/`**. |
| **Same-origin admin + API** | Browser **`credentials: "include"`** to **`/api`** on the web deployment host. |
| **Static hosting Option A** | SPA shipped as static files under the Next app; no separate admin-only Vercel project required for this model. |
| **Tier B cutover only** | **`ADMIN_SPA_ROUTING`**: **`spa`** vs **`legacy`** (default legacy if unset) in **`proxy.ts`** — Tier **A** (feature store / Edge Config) **not** built; see cutover execution **§7**. |
| **Next.js 16 constraint** | Admin routing and auth gating for `/admin` live in **`proxy.ts`** (not **`middleware.ts`**) where the framework disallows both. |
| **SPA HTML vs assets** | In **`spa`** mode: HTML navigations **rewrite** to **`/admin/index.html`**; **`/admin/assets/*`** and static extensions **bypass** admin role gate — mitigates **R21** chunk-load loops. |
| **Cache / SEO hygiene** | **`next.config.mjs`**: hashed assets long-cache; admin HTML **`no-store`** + **`X-Robots-Tag: noindex, nofollow`** — cutover execution **§1**. |
| **Rollback** | **`legacy`** mode keeps **`app/admin/**`** as full UI fallback; no legacy tree deleted in this program phase — [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md). |

---

## 3. Platform benefits achieved

- **Independent admin UI delivery:** Admin front-end can iterate on its own build (Vite) while APIs stay on Next.
- **Clear kill switch:** One env var + redeploy toggles SPA vs embedded admin (**Tier B**).
- **Shared contracts:** Matrix + packages reduce one-off `fetch` patterns; **`downloadBlob`** aligns exports with scoped GET semantics (stabilization report).
- **Operational hardening:** Shell degrades gracefully on **nav-counts** / **activity** failures; Sentry tuned to reduce **401/403** noise; login **`next`** loop eliminated (stabilization report).
- **Performance headroom:** Lazy routes, vendor chunk splits, longer **gcTime** for session/list cache, deferred client search on heavy lists (performance report).
- **Governed evolution:** RACI, PR checklist, API change process, release/incident playbooks — [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md).

---

## 4. Risks reduced

| Risk | Treatment |
|------|-----------|
| **R21** (proxy blocking SPA chunks) | **Mitigated** in **`spa`** mode — static asset bypass + rewrite table; see risk register. |
| **R3** (half-migrated prod) | **Mitigated in code** via **`ADMIN_SPA_ROUTING`**; operational default remains **legacy** until Platform flips **spa**. |
| **R12** (SPA observability noise) | **Partially** mitigated — Sentry **`beforeSend`**, sampling, environment label; synthetics still open. |
| **R22** (section-permissions flakiness) | **Partially** mitigated — explicit retries (no 401/403 hammering). |
| **R23** (raw `fetch` exports) | **Partially** mitigated — **`adminApi.downloadBlob`** / shared helper; documented public-catalog exception. |
| **R6** (bundle / TTI) | **Partially** mitigated — lazy routes + **manualChunks**; Lighthouse CI still a follow-up. |
| **R25** (governance drift) | **Addressed by process** — new register row + governance doc; effectiveness = ongoing reviews. |

**Most register rows remain Open** until sign-off, drills, matrix **Reviewed**, legacy deletion, and production evidence close them — see [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md).

---

## 5. Performance and maintainability improvements

- **Bundle:** Main entry chunk reduced **~512 kB → ~291 kB** minified (gzip **~150 → ~79 kB**) after vendor splits; **>500 kB warning cleared** — performance report.
- **Route code:** On-demand chunks per page via **`lazyAdminPages.tsx`**; **Suspense** + skeleton in **`AdminChrome`**.
- **Query cache:** Default **gcTime** 15m lists; bootstrap / section-permissions **30m**; mutations **retry: false** (stabilization + performance reports).
- **Render:** **`useDeferredValue`** on client search for **Bookings** and **Disputes**.
- **Maintainability:** Single governance doc; conventions + test strategy cross-linked; optional **`.github/CODEOWNERS.example`** for review routing.

---

## 6. Remaining known debt

| Debt | Owner / pointer |
|------|-----------------|
| **Parity QA** | No tracker rows **`Parity signed`**; wave exit sign-off table empty — tracker. |
| **Matrix Reviewed** | Shell APIs mostly **`In review`**; only **bootstrap** **Reviewed** — matrix §3. |
| **Production `spa` flip** | Env set per environment after staging burn-in — cutover execution **§1**. |
| **Tier A kill switch** | Not implemented — cutover execution **§7**. |
| **Rollback drills, N-1 tagging, synthetics, war room** | Documented as follow-ups — cutover execution **§7**; R8, R12. |
| **Dual UI (`app/admin/**` + SPA)** | Intentional until cutover §8 + **`legacy`** removal — R24; legacy decommission report **§6**. |
| **Product gaps** | Mixed SPA read / legacy CRUD; public catalog API; duplicate feature-flag surfaces — post-migration review + R18, R23. |
| **Security / auth doc** | **`ADMIN_SPA_AUTH_DECISION`** must be **Approved** for formal closure — cutover readiness / completion status. |

---

## 7. Operating model going forward

The admin surface is a **governed internal platform**, not a one-off migration branch:

- **Ownership:** RACI in [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) **§1** (EM, FE, BE, Platform, Design, QA, Security, PM Ops).
- **Change control:** PR checklist **§2.2**; API changes **matrix-first** **§5**; same-train doc updates **§8**.
- **Quality:** [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md) + governance **§4** for new pages.
- **UI:** [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md) + governance **§15**.
- **Cadence:** Biweekly (or monthly) **admin platform review** — governance **§9**; risk register reviewed on that rhythm (register header).
- **Incidents:** **`ADMIN_SPA_ROUTING=legacy`** + standard API rollback — governance **§7**; cutover plan.

---

## 8. Final program status

### **Complete with follow-up**

| Dimension | Verdict |
|-----------|---------|
| **Engineering deliverables** (SPA coverage, sync + proxy cutover wiring, stabilization, performance pass, governance framework) | **Complete** in-repo per the cited reports. |
| **Product / QA “done”** (**Parity signed**, matrix fully **Reviewed**) | **Not complete** — explicit follow-up. |
| **Operational production cutover** (**`ADMIN_SPA_ROUTING=spa`** on prod, drills, stakeholder sign-off) | **Not complete** — explicit follow-up (human / process). |
| **Legacy decommission** (delete **`app/admin/**`**) | **Deferred** — correct while **`legacy`** rollback remains policy. |

**Recommendation:** Treat **2026-04-05** (this closure doc) as the **program handoff date** from “migration project” to **platform mode** under [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md). Track remaining gates with [`ADMIN_SPA_COMPLETION_STATUS.md`](./ADMIN_SPA_COMPLETION_STATUS.md) until EM marks them closed.

---

## Sign-off (optional)

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Manager | | | |
| FE Lead | | | |
| Platform | | | |
| QA Lead | | | |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | Initial executive closure summary. |
