# Admin SPA — completion status (honest checklist)

**Date:** 2026-04-05  
**Purpose:** Single place to answer “is the new admin SPA done?” **Implementation** of routes/UI/API wiring is largely **complete**; **product parity sign-off**, **matrix Reviewed gates**, and **production cutover operations** are **not** automatically complete — they require explicit human/process steps.

**Canonical references:** [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md), [`ADMIN_CUTOVER_READINESS_REPORT.md`](./ADMIN_CUTOVER_READINESS_REPORT.md) (see **amendment** in its changelog), [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md), [`ADMIN_POST_MIGRATION_REVIEW.md`](./ADMIN_POST_MIGRATION_REVIEW.md), [`ADMIN_PRODUCTION_STABILIZATION_REPORT.md`](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md), [`ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md`](./ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md), [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md), [`ADMIN_MIGRATION_PROGRAM_CLOSURE.md`](./ADMIN_MIGRATION_PROGRAM_CLOSURE.md).

---

## 1. Pages / routes — **implemented** (96 legacy paths)

| Criterion | Status | Notes |
|-----------|--------|--------|
| All matrix rows have SPA handling | **Yes** | Tracker: every legacy path is **`Migrated (SPA)`** — first-class page, client redirect, or legacy bridge. |
| **`Parity signed` / `Done`** | **No** | Tracker rule: QA + FE sign-off columns and wave exit table are still **unchecked**. “Migrated” ≠ “signed off”. |
| Deep links / redirects | **Mostly** | R4/R19: bookmark E2E and edge alignment still recommended; known nav vs `/broadcast/history` nuance documented in tracker. |

---

## 2. UI / UX — **implemented with known variance**

| Criterion | Status | Notes |
|-----------|--------|--------|
| Shared patterns (skeleton, retry, RBAC hooks) | **Yes** | Foundation docs + stabilization pass (session loading, shell soft-fail). |
| Visual parity with legacy | **Partial** | R9: mix of **`AdminDataList`** vs table-only pages; many surfaces are **read in SPA + CRUD on legacy**. |
| Responsive / M4 (maps, heavy views) | **Partial** | Gods Eye, service zones, etc. — matrix and progress report call out **unsigned** heavy UX. |

---

## 3. APIs — **shared backend; contract gates open**

| Criterion | Status | Notes |
|-----------|--------|--------|
| **`/api/admin/*` stability** | **Yes** | SPA and legacy both call the same Next routes; no duplicate backend required for basic operation. |
| Parity matrix **`Reviewed`** | **Partial** | Shell rows (nav-counts, section-permissions, search, tenants, activity) remain **`In review`** except **bootstrap** (**Reviewed**). R2 applies. |
| Known contract exceptions | **Documented** | e.g. public **`/api/public/products`** for catalog row; exports now prefer **`adminApi.downloadBlob`** (see stabilization report / R23). |

---

## 4. Infra / cutover wiring — **implemented in repo; flip is operational**

| Criterion | Status | Notes |
|-----------|--------|--------|
| SPA artifact on web deploy | **Yes** | `sync-admin-spa.mjs` → `apps/web/public/admin/` during web build ([`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md)). |
| Tier **B** kill switch | **Yes** | **`ADMIN_SPA_ROUTING=spa` \| `legacy`** in **`apps/web/src/proxy.ts`**. |
| Static asset bypass (R21) | **Mitigated** | **`/admin/assets/*`** and extension allowlist before admin gate in **`spa`** mode. |
| Cache / robots for `/admin` | **Yes** | **`next.config.mjs`** per execution report (immutable assets; HTML **no-store** + **X-Robots-Tag**). |
| **`vercel.json` rewrites** | **N/A for Option A** | Static files under **`public/admin`** are served by Next; no extra rewrites required if build sync runs on Vercel. |
| **`ADMIN_SPA_ROUTING=spa` on prod** | **No** (by design) | Human flip after staging validation ([`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md) §1). |

---

## 5. Security / auth — **designed; approvals and burn-in open**

| Criterion | Status | Notes |
|-----------|--------|--------|
| Cookie / same-origin model | **Implemented** | `credentials: "include"`, bootstrap gate — R1 residual = **integrated staging** validation. |
| **`ADMIN_SPA_AUTH_DECISION`** | **Check doc status** | Cutover readiness: Security **Approved** may still be pending — confirm header in [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md). |
| RBAC single package | **Mitigated in architecture** | R13: **`@beautonomi/admin-access`** + Next re-export; E2E per role still recommended (R5). |

---

## 6. Risks — **not “all closed”**

| State | IDs | Meaning |
|-------|-----|---------|
| **Mitigated (specific item)** | R21 | SPA static load path addressed in **`proxy.ts`** when **`spa`**. |
| **Partially mitigated** | R12, R22, R23 | Stabilization + Sentry tuning + exports; synthetics / catalog exception / matrix still open. |
| **Open** | R1–R20, R24 (and R22–R23 as rows) | See register; **none** should be read as “fixed forever” without ongoing review. |
| **Closed (archive)** | — | Register archive is **empty** — intentional until EM moves items post–cutover. |

---

## 7. What “all done” would require (checklist)

Use this for EM/Platform/QA sign-off:

1. [ ] **`ADMIN_SPA_AUTH_DECISION`** marked **Approved** (Security).  
2. [ ] Matrix shell + critical page rows moved to **`Reviewed`** per process (§1 of matrix).  
3. [ ] Wave tracker: target rows **`Parity signed`** or explicit **scope-cut** with PM.  
4. [ ] Staging: **`ADMIN_SPA_ROUTING=spa`**, smoke (login, bootstrap, scope, finance vs overview on reports).  
5. [ ] Rollback **drill** recorded (R8); **`ADMIN_SPA_ROUTING=legacy`** verified.  
6. [ ] Sentry DSN + optional synthetics for `/admin` (R12).  
7. [ ] Production flip + hypercare window per [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md).  
8. [ ] Post–stability window: legacy tree removal per [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md) (R24).

---

## 8. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | Initial completion-status doc; reconciles tracker/matrix/risk/cutover docs. |
