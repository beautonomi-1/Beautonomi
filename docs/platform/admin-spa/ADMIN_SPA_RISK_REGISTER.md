# ADMIN_SPA_RISK_REGISTER

**Purpose:** Formal risk tracking for the **admin platform** (migration and steady state). Review **weekly** during active migration; after cutover use the **biweekly admin platform review** in [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) **§9** (or fold into that agenda). Escalate **High** impact items to leadership.

**Owner:** EM (facilitates); row **Owner** accountable for mitigation. **Ownership model:** governance **§1**.

**Scale:** Likelihood **L** / **M** / **H**; Impact **L** / **M** / **H**

**Seed:** Core risks R1–R17 carried from V2.1 plan themes; R18–R20 added from current admin route/shell behavior (2026-04-05). **Completion vs open work:** see [`ADMIN_SPA_COMPLETION_STATUS.md`](./ADMIN_SPA_COMPLETION_STATUS.md) — risks stay **Open** until EM closes them against sign-off and production evidence.

**Steady-state guardrails:** [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) (review expectations, API process, release checklist, incidents).

---

## Active risks

| ID | Risk | L | I | Mitigation | Contingency | Owner | Status |
|----|------|---|---|------------|-------------|-------|--------|
| R1 | Auth/session breaks (cookie, SameSite, proxy) | M | H | Same-origin deployment; staging burn-in; `ADMIN_SPA_AUTH_DECISION` approved | Instant rollback; extend legacy parallel run | Platform | Open |
| R2 | API parity gaps discovered mid-wave | H | H | **Matrix gate**; no code without Reviewed rows; contract tests | Stop wave; patch API or scope cut with PM | FE lead | Open |
| R3 | Half-migrated features in production | M | H | **`ADMIN_SPA_ROUTING`** (`spa` / `legacy`) in **`proxy.ts`**; wave exit criteria; tracker discipline — see [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md) | Set **`legacy`** (or unset) + redeploy | EM | Open |
| R4 | Route / deep link mismatch (404, SEO, bookmarks) | M | M | Path parity with legacy; redirect table in cutover doc | Hotfix routes | FE | Open |
| R5 | Role / section mismatch (403 loops, wrong nav) | M | H | RBAC E2E suite; bootstrap contract | Emergency nav kill-switch to minimal shell | Security | Open |
| R6 | Performance regression (bundle size, TTI) | M | M | **Lazy routes** + **`manualChunks`** + **`gcTime`** — [`ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md`](./ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md); Lighthouse CI on SPA | Further lazy + virtualize tables | FE | Open |
| R7 | Nav counts / dashboard permission bugs persist | M | M | Wave 0 fixes; matrix documents behavior | Remove badges temporarily | FE | Open |
| R8 | Rollback procedure fails (infra) | L | H | Drill twice before cutover; document RTO | Revert DNS / edge to previous config | DevOps | Open |
| R9 | Inconsistent UX across 96 pages | H | M | `ADMIN_SPA_UI_CONVENTIONS`; reference pages; design QA | Wave-level UI freeze | Design | Open |
| R10 | Backend API drift during freeze | M | M | Governance: API change triage; matrix changelog | Versioned endpoints | BE lead | Open |
| R11 | Stakeholder confusion (wrong URL, training) | M | L | Support macros; changelog; internal demo | Office hours | PM Ops | Open |
| R12 | Observability blind spot (SPA errors) | M | H | Sentry SPA project; **`beforeSend`** drops **AdminApiError** 401/403; **`VITE_SENTRY_ENVIRONMENT`**; **`tracesSampleRate` 0.1** — see [`ADMIN_PRODUCTION_STABILIZATION_REPORT.md`](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md) | Synthetic checks; pause cutover | Platform | Open |
| R13 | **RBAC drift** between SPA and Next (`canAccessSection` diverges) | M | H | **`@beautonomi/admin-access`** package in repo; Next re-exports from `apps/web/src/lib/admin-sections.ts` — **mitigation in flight** until SPA cutover proves parity | Freeze SPA nav; hotfix package | FE lead | Open |
| R14 | **CSP** blocks scripts or API calls | M | M | Report-Only → enforce; explicit `connect-src` | Temporary CSP relax with Security approval | Platform | Open |
| R15 | **CDN / browser cache** shows stale SPA after hotfix | M | M | Hashed assets; short HTML TTL; purge runbook | Emergency purge + comms | DevOps | Open |
| R16 | **Understaffing** vs 90-day parity | H | M | V2.1 migration plan guardrail (120d / descope) | Cut scope with PM sign-off | EM | Open |
| R17 | **Shell feature gap** (e.g. notifications) missed in matrix | M | M | Wave 0 shell rows mandatory | Ship gap fix before cutover | FE lead | Open |
| R18 | **Two feature-flag UIs** (`/admin/settings/feature-flags` vs `/admin/control-plane/feature-flags`) diverge in behavior or AuthZ | M | M | Matrix rows for both; single product owner; consolidation backlog | Document canonical surface for SPA v1 | PM + FE lead | Open |
| R19 | **Redirect-only routes** (`/admin/pricing-plans`, `/admin/sms-templates`, `/admin/email-templates`, `/admin/control-plane`, analytics settings) break SPA router or deep links | M | M | Parity matrix + cutover redirect table; E2E bookmark tests | Server redirects preserved at edge | FE | Open |
| R20 | **Embedded / child components** (e.g. explore table, service-zone map) hide API usage from page-level grep | M | M | Matrix §4 references components; grep `components/admin` per wave | Component-level sub-rows in matrix | FE lead | Open |
| R21 | **`proxy.ts` blocks SPA static assets** under `/admin/assets/*` after cutover (unauthenticated chunk load → redirect loop) | L | H | **`ADMIN_SPA_ROUTING=spa`:** early `NextResponse.next()` for `/admin/assets/*` + extension matches before admin auth; HTML paths rewrite to `/admin/index.html` | If new asset prefixes appear, extend `isAdminSpaBundledAsset` in `proxy.ts` | Platform | Mitigated (SPA mode) |
| R22 | **Section-permissions fetch fails** — SPA falls back to `ADMIN_SECTION_ROLES` defaults (`AdminSessionProvider`); nav banner warns but DB matrix may differ | M | M | Explicit query **retry** (no 401/403; ≤3 for other errors); refetch banner unchanged — [`ADMIN_PRODUCTION_STABILIZATION_REPORT.md`](./ADMIN_PRODUCTION_STABILIZATION_REPORT.md) | Freeze team-permission edits until API healthy | FE lead | Open |
| R23 | **Direct `fetch` for exports / public catalog** bypasses `adminApi` (scope injection, shared error parsing) | M | M | **`adminApi.downloadBlob`** + **`downloadAdminBlob`** / bookings export; **public catalog** still `fetch` (documented exception) — stabilization report | Remaining raw paths in matrix | FE lead | Open |
| R24 | **Dual admin UI** (Next `app/admin/**` + Vite SPA) maintained past rollback window | M | M | Delete legacy tree per [`ADMIN_LEGACY_DECOMMISSION_REPORT.md`](./ADMIN_LEGACY_DECOMMISSION_REPORT.md) after sign-off | Confusion, double security review, larger Next compile graph | EM + FE lead | Open |
| R25 | **Governance drift** — matrix/tracker/conventions ignored after migration; silent API or RBAC changes | M | H | [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) **§2–5**; PR checklist; biweekly platform review **§9** | Freeze admin releases until backlog reconciled; EM audit | EM | Open |

---

## Closed risks (archive)

| ID | Closed date | Outcome |
|----|-------------|---------|
| | | |

---

## Escalation

- **Impact H + Likelihood M/H:** notify Engineering Director + Platform within **24h** of identification.  
- **Production incident during cutover:** follow `ADMIN_SPA_CUTOVER_PLAN.md` rollback + incident process.  
- **Incident ownership (steady state):** [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) **§7** (flag rollback, API revert, comms).
