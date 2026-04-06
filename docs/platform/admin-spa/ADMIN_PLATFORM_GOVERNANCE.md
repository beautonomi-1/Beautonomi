# Admin platform — long-term governance

**Purpose:** After SPA migration, the admin surface (`apps/admin-web` + shared **`/api/admin/*`**, **`@beautonomi/admin-access`**, **`@beautonomi/admin-api-client`**) is a **governed internal product**. This document defines **who decides**, **how changes ship safely**, and **what artifacts must stay current** so the platform does not regress into ad-hoc edits.

**Scope:** Admin UI, admin BFF/API routes consumed by the SPA, RBAC package, proxy/static cutover wiring, and **documentation** under `docs/platform/admin-spa/`.

**Related:** [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md), [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md), [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md), [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md), [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md), [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md), [`ADMIN_MIGRATION_PROGRAM_CLOSURE.md`](./ADMIN_MIGRATION_PROGRAM_CLOSURE.md) (program handoff to this model).

---

## 1. Ownership model (by area)

**RACI:** **R**esponsible (does the work), **A**ccountable (single approver), **C**onsulted, **I**nformed.

| Area | Accountable (A) | Responsible (R) | Consulted (C) | Informed (I) |
|------|-----------------|-----------------|---------------|----------------|
| **Admin SPA UI** (`apps/admin-web`) | EM | FE lead (delegates to engineers) | Design, PM | QA, Support |
| **UI consistency / patterns** | Design lead | FE lead | EM | — |
| **RBAC & sections** (`@beautonomi/admin-access`, Next re-export) | Security / EM (shared) | FE lead | BE lead | PM |
| **Admin HTTP client** (`@beautonomi/admin-api-client`) | FE lead | FE engineer on change | BE lead | — |
| **`/api/admin/*` routes** (`apps/web/src/app/api/admin`) | BE lead | BE engineer on change | FE lead (contract), Security (AuthZ) | EM |
| **Cutover / proxy / static admin** (`proxy.ts`, `public/admin`, `ADMIN_SPA_ROUTING`) | Platform / EM | Platform engineer | FE lead | DevOps |
| **Observability** (Sentry SPA, synthetics, dashboards) | Platform | Platform + FE | EM | On-call |
| **QA sign-off & E2E** | QA lead | QA engineer | FE lead | EM |
| **Parity matrix & API truth** | FE + BE leads (joint) | FE lead maintains structure; BE validates AuthZ | PM (scope) | EM |
| **Wave tracker & migration inventory** | EM | PM or EM (rotating) | FE lead | — |
| **Risk register** | EM | EM (facilitates review) | Area owners for rows | Leadership (H/H) |
| **Support / training / comms** | PM Ops | Support lead | PM | EM |

**Product domains (triage, not exclusive code ownership):** Finance, Ops, Content, Marketing, Integrations, Control-plane — each has a **default PM + FE + BE contact** named in the EM’s team roster (maintain in wiki or tracker **Blocker** column when unclear).

---

## 2. Code review expectations

### 2.1 Required reviewers

| Change type | Minimum reviewers |
|-------------|-------------------|
| **Any `apps/admin-web` PR** | **1 FE** with admin SPA context (CODEOWNERS or team rule). |
| **Touches AuthZ, `admin-access`, or section constants** | **FE + Security** (or Security-delegated FE with documented checklist). |
| **Touches `/api/admin/*`** | **BE + FE** (FE confirms SPA/matrix impact). |
| **`proxy.ts`, `ADMIN_SPA_ROUTING`, sync scripts** | **Platform + FE**. |
| **Dependency major bumps** (React, Router, Vite, TanStack Query) | **FE lead** approval. |

### 2.2 Reviewer checklist (paste in PR description or review comment)

- [ ] **Matrix:** `ADMIN_API_PARITY_MATRIX.md` updated if API or AuthZ changed; status reflects **Reviewed** process if closing a gate.  
- [ ] **Tracker:** `ADMIN_SPA_WAVE_TRACKER.md` updated if route status, blocker, or responsive class changed.  
- [ ] **Conventions:** Matches [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md) §14 primitives (query keys, RBAC hooks, error patterns).  
- [ ] **New route:** Entry in **`lazyAdminPages.tsx`** + **`App.tsx`** (no static page imports from `App.tsx`).  
- [ ] **Tests:** Per §4 of this doc and [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md).  
- [ ] **No silent product change:** If behavior changes, PM aware or ticket linked.

### 2.3 Merge criteria

- Green **CI** for `admin-web` (lint, typecheck, unit tests) and **`web`** when API/proxy touched.  
- **No** merge with failing checks unless EM **written** exception (incident hotfix), recorded in PR.

---

## 3. Conventions enforcement

| Mechanism | What it enforces |
|-----------|------------------|
| **ESLint + TypeScript** (`apps/admin-web`) | Style, imports, types — **required** on every PR. |
| **CI** (`.github/workflows`) | `turbo` / `pnpm` jobs must include **`admin-web`** when that package changes. |
| **CODEOWNERS** (recommended) | Copy [`.github/CODEOWNERS.example`](../../../.github/CODEOWNERS.example) → `.github/CODEOWNERS` with real `@org/team` handles; paths: `apps/admin-web/**`, `packages/admin-access/**`, `packages/admin-api-client/**`, `apps/web/src/app/api/admin/**`, `apps/web/src/proxy.ts`. |
| **Docs gate** | PR template checkbox: matrix + tracker (see §8). |
| **Design exceptions** | Any deviation from UI conventions requires **Design + EM** note in **wave tracker** (existing rule in conventions doc). |

**Non-goals:** Do not add heavy custom lint rules without FE lead review; prefer documented patterns over brittle AST rules.

---

## 4. Testing expectations (new or changed admin pages)

Minimum bar for a **new** admin page or **material** change to an existing one:

| Artifact | Expectation |
|----------|-------------|
| **Query keys** | If new `adminQueryKeys` segment or shape → extend **`adminQueryKeys.test.ts`**. |
| **Pure helpers** | New URL/builder/parser logic → **Vitest** unit tests. |
| **RBAC** | New section or page gate → add or extend **E2E or integration** in the **`admin-rbac`** plan (staging); document role used. |
| **Server pagination / filters** | If API uses `page` / `limit` / filters → **integration or E2E** proving query params match handler (per test strategy §2.4). |
| **Critical path** | If page is **P0** (EM-defined: e.g. payouts, bookings, login), add **E2E** to critical set before prod deploy. |
| **Regressions** | Reuse shared primitives (`AdminQueryBlock`, etc.) to avoid duplicating E2E for every list page. |

Full pyramid and CI gates: [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md).

---

## 5. API contract change process

1. **Intent:** Author opens a short design note (ticket or PR description): consumer(s), AuthZ, breaking vs additive.  
2. **Matrix first:** Add or edit rows in **`ADMIN_API_PARITY_MATRIX.md`** (§4 index + §5 detail as needed) — **Draft** → **In review** → **Reviewed** with **FE + BE** sign-off in commit message or ticket.  
3. **Implementation order:** Prefer **additive** fields first; **breaking** changes require **versioned path** or **coordinated** SPA + API deploy (document in matrix §8 changelog).  
4. **Client:** Update **`@beautonomi/admin-api-client`** or SPA **`adminApi.getJson`** usage; rebuild package **`dist`** if types surface from `dist`.  
5. **RBAC:** Any `requireAdminSection` / role change → Security **C** from §1 consulted.  
6. **Rollback:** Document how SPA behaves on old API (feature degrade vs hard error) for one release window.

**Rule:** No production API change that affects the SPA without a **matrix row** update in the same release train (same PR or linked PR with merge order documented).

---

## 6. Release / checklist process

### 6.1 Standard admin-affecting release (staging → production)

- [ ] **Matrix / tracker** updated for this release’s scope.  
- [ ] **CI green** including `admin-web` + `web` build (SPA sync if applicable).  
- [ ] **Staging smoke:** login, bootstrap, one **P0** flow per touched domain.  
- [ ] **Sentry:** release tag / environment for admin bundle if DSN enabled.  
- [ ] **Cache:** If static admin assets changed, confirm **`next.config`** / CDN behavior per [`ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`](./ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md) and R15.  
- [ ] **Cutover flag:** If release touches **`proxy.ts`** or artifact path, confirm **`ADMIN_SPA_ROUTING`** intent for target env ([`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md)).  
- [ ] **Comms:** Support macro or changelog if user-visible URL or behavior changes (PM Ops).

### 6.2 Post–legacy deletion (future)

When **`app/admin/**`** is removed, add **“no legacy fallback”** check to release checklist and update rollback row to **redeploy previous deployment** only.

---

## 7. Incident & rollback ownership

| Phase | Owner | Actions |
|-------|-------|---------|
| **Detection** | On-call (Platform primary for **availability**; FE for **functional** admin bugs) | Triage Sentry / synthetics / customer reports. |
| **Severity** | EM + On-call | SEV definitions per company incident policy; admin **auth down** = high default. |
| **Mitigation — SPA flag** | Platform | Set **`ADMIN_SPA_ROUTING=legacy`** (or unset) on affected Vercel env; redeploy if needed — [`ADMIN_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md). |
| **Mitigation — API** | BE on-call | Roll forward fix or revert API deploy per standard BE process. |
| **Comms** | PM Ops + EM | Status page / internal Slack per playbook. |
| **Post-incident** | EM | Blameless review; update **risk register**; add test or synthetic if gap. |

**Reference:** [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md) escalation; R3, R8, R12, R15, R21, R24.

---

## 8. Documentation update expectations

| Trigger | Documents to update (minimum) |
|---------|-------------------------------|
| **New admin route** | `ADMIN_SPA_WAVE_TRACKER.md`; `lazyAdminPages.tsx` + `App.tsx`; matrix §4 row if new API. |
| **API / AuthZ change** | `ADMIN_API_PARITY_MATRIX.md`; link from tracker **Matrix §4** column. |
| **UI pattern change** | `ADMIN_SPA_UI_CONVENTIONS.md` + announce to FE channel. |
| **Test / CI change** | `ADMIN_SPA_TEST_STRATEGY.md`. |
| **Cutover / infra** | `ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`, `ADMIN_CUTOVER_EXECUTION_REPORT.md`, or `ADMIN_CUTOVER_READINESS_REPORT.md` as appropriate. |
| **New operational risk** | `ADMIN_SPA_RISK_REGISTER.md`. |
| **Performance / bundle policy** | `ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md` or new appendix. |

**PR discipline:** Same PR as code when possible; otherwise **follow-up PR within 48h** with ticket link (EM may waive for hotfix with debt ticket).

---

## 9. Cadence (post-migration)

| Forum | Frequency | Purpose |
|-------|-----------|---------|
| **Admin platform review** | **Biweekly** (or monthly at low churn) | Tracker, matrix **In review** backlog, risk register R1–R24, cutover/legacy status. |
| **Security + RBAC** | **Quarterly** or when `admin-access` changes | R5, R13, R18. |
| **Governance doc** | **Quarterly** | EM + FE lead verify ownership table and checklists still match org. |

---

## 10. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | Initial admin platform governance (post-migration steady state). |
