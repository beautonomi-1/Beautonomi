# Admin SPA cutover readiness report

**Date:** 2026-04-07  
**Scope:** Migrated admin app (`apps/admin-web`) vs operational requirements in `ADMIN_SPA_CUTOVER_PLAN.md`, `ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`, `ADMIN_SPA_WAVE_TRACKER.md`, and `ADMIN_SPA_RISK_REGISTER.md`.  
**Method:** Document cross-check + targeted repo verification (`apps/web/vercel.json`, `apps/web/src/proxy.ts`, `.github/workflows/ci.yml`, `apps/admin-web`, parity/wave docs).

---

## Executive conclusion

**Not ready** (product / ops / sign-off gates)

Production cutover is still blocked on **parity matrix Reviewed rows**, **QA/FE Parity signed**, **Security approval** on the auth decision, **staging validation** with **`ADMIN_SPA_ROUTING=spa`**, and **documented rollback drills** — per the project’s own gates.

**Amendment (2026-04-05):** The **original** version of this review (2026-04-07 file date) cited **missing** SPA-on-web integration, **no Tier B flag**, and **proxy blocking `/admin/assets/*`**. Those items are **now implemented** in-repo — see [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md) (`sync-admin-spa.mjs`, **`ADMIN_SPA_ROUTING`**, static bypass in **`spa`** mode, **`next.config.mjs`** `/admin` headers). **`vercel.json`** still has no SPA rewrites because **Option A** serves the bundle from **`public/admin`**. Reconciled checklist: [`ADMIN_SPA_COMPLETION_STATUS.md`](./ADMIN_SPA_COMPLETION_STATUS.md).

---

## 1. Route coverage and parity completeness

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **96 legacy routes** are tracked in `ADMIN_SPA_WAVE_TRACKER.md`; **none** are `Done` or **`Parity signed`** — all remain **`In progress`**. | **High** | Tracker table + narrative deltas (W0 exit verify incomplete, matrix shell rows not fully Reviewed). | Complete wave exit checklists; move rows to `Done` only per `ADMIN_SPA_TEST_STRATEGY.md`; obtain QA/FE **Parity signed** for critical paths before any prod cutover. |
| **`ADMIN_API_PARITY_MATRIX.md`** §3 shell rows (`nav-counts`, `section-permissions`, `search`, `tenants`, `activity`) are **`In review`**, not **`Reviewed`**. Bootstrap is **Reviewed**. | **High** | Matrix §3 status column. | Finish §1 process for shell APIs; mark **Reviewed** with FE+BE sign-off; add/keep contract tests per matrix §6. |
| **Known product/AuthZ gaps** documented: reports vs overview roles, public product catalog row, export contracts, nav-counts vs audience mismatch, duplicate feature-flag surfaces (R18). | **High** | Matrix §7–8; `ADMIN_SPA_RISK_REGISTER.md` R2, R13, R18; tracker “Not Parity signed” notes. | Resolve or explicitly **scope-cut** with PM + Security; update matrix to **Deprecated (product approved)** where intentional. |
| **Deep links / bookmarks:** SPA adds routes such as `/broadcast/history` while nav still targets `/admin/broadcast` (basename `/admin` → hub). | **Low** | `App.tsx` + `BroadcastHubPage.tsx`; `nav.ts` uses `/admin/broadcast`. | Add nav sub-item or document “history” URL in support macro; E2E bookmark test for redirects (R19). |

**Verdict (area 1):** Incomplete for cutover — parity gates in the repo’s own rules are **not** satisfied.

---

## 2. Legacy `/admin` route transition readiness

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Production still serves admin only from Next**; deployment model states **no** `/admin` SPA rewrites in `apps/web/vercel.json` yet. | **Critical** | `ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md` §1; `apps/web/vercel.json` (crons/headers only — **no** rewrites for SPA). | Implement chosen monorepo option **A or B** from deployment doc §3 (copy `admin-web/dist` into Next static tree **or** edge/CDN rewrite); document in cutover PR. |
| **`proxy.ts` + `/admin/assets/*` (historical)** | **Addressed in code** when **`ADMIN_SPA_ROUTING=spa`** | **`isAdminSpaBundledAsset`**, rewrite to **`index.html`** for non-assets — see [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md). **Re-verify** after any change to Vite `base` or asset dir. |
| **Cutover plan §2** requires recording whether legacy `app/admin/**` is deleted or replaced by a **single catch-all** — not evidenced as decided in code/docs for prod. | **High** | No single catch-all found in this review (legacy tree still primary). | Record decision in PR + cutover plan appendix; align with rollback matrix row. |
| **HTML TTL / CDN purge** for `/admin` entry not configured in repo. | **Medium** | `ADMIN_SPA_CUTOVER_PLAN.md` §2a; `vercel.json` has no `/admin` cache headers. | Set short TTL or `no-cache` for HTML; document purge runbook (R15). |

**Verdict (area 2):** **Code path ready** for same-origin SPA when **`spa`** mode + build sync run; **operational** flip and HTML TTL discipline remain before prod.

---

## 3. Auth / session behavior (preview and production-like)

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Approved auth model** is documented but **`ADMIN_SPA_AUTH_DECISION.md` status remains `Draft` → `Approved` (Security sign-off)**. | **High** | Doc header §“Status”. | Security sign-off; then mark **Approved** and link from cutover plan. |
| **Same-origin production** is the intended model; SPA uses `credentials: "include"` (README). **Preview:** Vercel preview URLs for **`apps/web`** are production-like for cookies on that host; **admin SPA is not separately deployed** per deployment doc — preview of full cutover likely requires **branch deploy with integrated artifact** or documented manual steps. | **Medium** | `ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md` §1, §3. | Define **one** staging target where `/admin` is SPA + `/api` on same host; run session smoke (login, bootstrap, CSRF mutation, superadmin scope). |
| **CORS allowlist** in `proxy.ts` lists `localhost:3000`, `3001`, `8081–8084`, etc.; **`localhost:5173` is not listed** (only relevant if browser calls API **cross-origin** without Vite proxy). | **Low** | `ALLOWED_ORIGINS` in `proxy.ts`. | Document “always use Vite proxy for local admin SPA”; if cross-origin dev is needed, add origin with Security review. |
| **Multi-market** per-host sessions documented in auth decision §6a — no code change required here; runbook must match. | **Low** | `ADMIN_SPA_AUTH_DECISION.md`. | Support/comms: deep links must use correct host. |

**Verdict (area 3):** Behavior is **designed** and locally documented; **production-like validation** and **Security approval** are incomplete.

---

## 4. Vercel project and routing readiness

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Primary project remains `apps/web` (Next)**; **`vercel.json`** has no `/admin` rewrites. | **OK for Option A** | Static artifact under **`public/admin/`** from build sync; Next serves files + **`proxy.ts`** rewrites HTML navigations in **`spa`** mode. Confirm Vercel build runs **`admin-web` → sync** (see CI / turbo). |
| **CI builds `admin-web`** via `build-admin-web` job with placeholder Supabase env — good for artifact integrity. | **Positive** | `.github/workflows/ci.yml` `build-admin-web`. | Keep; optionally add **smoke** step (e.g. list `dist` assets) post-build. |
| **Deployment doc §5 checklist** (flag tier, rollback row, HTML cache, `X-Robots-Tag`) — **unchecked**. | **High** | `ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md` §5. | Complete checklist before staging SPA-default; add `X-Robots-Tag: noindex, nofollow` on `/admin` responses if not relying on HTML meta alone (cutover doc prefers header verification). |

**Verdict (area 4):** **Ready for Option A** (static + proxy) assuming CI/build pipeline matches [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md); re-validate if deploy graph changes.

---

## 5. Environment variable completeness

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Documented SPA vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN` (`apps/admin-web/README.md`). | — | | |
| **`.env.example`** under `apps/admin-web` | **Positive** | Present (Supabase + optional Sentry vars). | Keep in sync with README. |
| **Production Vercel:** build-time injection for `admin-web` when integrated must match **same Supabase project** as `NEXT_PUBLIC_*` (README). | **Medium** | Implicit for same-origin. | Document in Vercel project env UI; verify preview/prod values in runbook. |
| ~~`VITE_WEB_ORIGIN`~~ (removed) | — | Historical note: was used for split-origin deep links; SPA no longer depends on it. | — |

**Verdict (area 5):** **Adequate for dev**; **production env wiring** depends on unbuilt integration step and should be explicitly checked at deploy time.

---

## 6. Observability and error tracking

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Sentry is optional** (`VITE_SENTRY_DSN`); `main.tsx` initializes when set; `ErrorBoundary` captures. | **Positive** | `apps/admin-web/src/main.tsx`, `ErrorBoundary.tsx`. | **Require** DSN for staging/prod admin builds; tag releases/environments; align with cutover plan §5–6 (bootstrap failures, `admin-spa` tag per R12). |
| **Synthetic `/admin` checks** and dashboards called out in cutover plan — **not verified** in repo as configured. | **Medium** | `ADMIN_SPA_CUTOVER_PLAN.md` §1c, §6. | Add synthetic monitor + dashboard links to runbook; name on-call (FE + Platform). |
| **CI:** `admin-web` in **typecheck**, **lint**, and **build** (web build depends on admin artifact). | **Positive** | `.github/workflows/ci.yml`. | Keep aligned when filters change. |

**Verdict (area 6):** **Code supports** observability; **operational wiring** (DSN, synthetics, dashboards) is incomplete for cutover hypercare.

---

## 7. Rollback clarity

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Tier B env flag** | **Implemented** | **`ADMIN_SPA_ROUTING`** in **`apps/web/src/proxy.ts`** — see execution report. | **Drill on staging:** flip **`spa`** ↔ **`legacy`**; record RTO. |
| **N-1 artifact tag** and registry retention called out — **process not evidenced** in-repo. | **High** | `ADMIN_SPA_CUTOVER_PLAN.md` §3 prerequisite. | Record N-1 image/deploy tag in release checklist; ensure Vercel/Git retention policy. |
| **Rollback matrix row 2** (legacy removed from main) requires **pre-identified tag** — high risk if team deletes legacy before stable SPA. | **High** | Cutover plan §1b. | Do not delete `apps/web/src/app/admin/**` until milestone + sign-off (plan §8). |

**Verdict (area 7):** **Mechanism implemented**; **drills and N-1 tagging** remain process gaps until evidenced.

---

## 8. Release communication and sign-off readiness

| Finding | Severity | Evidence / blocker | Remediation |
|--------|----------|-------------------|-------------|
| **Stakeholder checklist** (EM, Platform/Security, QA, Support) in cutover plan §7 — **all unchecked** in source doc. | **High** | `ADMIN_SPA_CUTOVER_PLAN.md` §7. | Complete sign-offs; fill cutover **date/time (UTC)**. |
| **Wave exit table** in wave tracker — **all EM/QA boxes empty**. | **High** | `ADMIN_SPA_WAVE_TRACKER.md` “Wave exit sign-off”. | Complete W0–W5 exits per migration plan or obtain EM **written** exception (tracker rule). |
| **Support macro / low-traffic window / on-call** — referenced in cutover plan §4, §1c — not evidenced as prepared. | **Medium** | Plan text only. | Draft support macro; schedule window; name on-call before T-24h. |

**Verdict (area 8):** **Not** sign-off ready.

---

## Risk register crosswalk (sample)

| Risk ID | Relevance to this review |
|---------|---------------------------|
| R1 | Open — integrated staging burn-in for cookies/session; static chunk path **mitigated** in **`spa`** mode (R21). |
| R2 | Open — matrix not Reviewed for shell; wave tracker not Parity signed. |
| R3 | **Partial** — Tier B env exists; prod flip is operational choice. |
| R8 | Open — drills and N-1 tag not evidenced. |
| R12 | Open — Sentry/env + synthetics not mandated in config. |
| R15 | **Partial** — **`next.config.mjs`** sets `/admin` cache/robots per execution report; CDN purge runbook still applies. |
| R21 | **Mitigated** in **`spa`** mode (static bypass). |

---

## Severity legend (used above)

- **Critical:** Would cause outage, auth loop, or violates non-negotiable cutover plan requirement (e.g. Tier A/B, broken asset load).  
- **High:** Violates documented gates (parity, sign-off, rollback drill) or major product/security ambiguity.  
- **Medium:** Operational or quality gap; should block **production** until addressed but not always a hard technical impossibility.  
- **Low:** Hygiene, documentation, or narrow edge cases.

---

## Single-line summary

**Not ready for prod sign-off** — complete matrix **Reviewed** / tracker **Parity signed**, Security approval, **`ADMIN_SPA_ROUTING=spa`** staging burn-in, drills, and synthetics. **Infra blockers from the original review** (SPA artifact on web, Tier B, asset bypass) are **implemented**; see [`ADMIN_SPA_COMPLETION_STATUS.md`](./ADMIN_SPA_COMPLETION_STATUS.md).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-07 | Initial cutover readiness review. |
| 2026-04-05 | Amendment: executive conclusion, areas 2/4/7, crosswalk, and summary updated to reflect **`ADMIN_CUTOVER_EXECUTION_REPORT`** implementation; link **`ADMIN_SPA_COMPLETION_STATUS`**. |
