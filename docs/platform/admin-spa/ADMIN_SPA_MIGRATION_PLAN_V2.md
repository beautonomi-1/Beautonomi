# Admin / Superadmin Portal — SPA Migration Blueprint (V2.1)

**Status:** Execution-ready program definition (post–critical review)  
**Backend of record (Phase 1–2):** Existing Next.js routes under `apps/web/src/app/api/admin/**` (`/api/admin/*`)  
**Current UI:** `apps/web/src/app/admin/**` + `apps/web/src/components/admin/AdminShell.tsx`  
**Target UI:** Dedicated SPA in monorepo (see Section 3)  
**Redline V2→V2.1:** [`ADMIN_SPA_REDLINE_V2_TO_V2.1.md`](./ADMIN_SPA_REDLINE_V2_TO_V2.1.md)  
**Related repo docs:** `docs/ADMIN_PORTAL_ROLE_MODEL.md`, `docs/ADMIN_PORTAL_DATA_CONTRACTS.md`, `docs/admin-api-route-taxonomy.csv`, `docs/scripts/generate-admin-route-taxonomy.mjs`

**Execution pack (operational spine, seeded from repo):** [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md) (shell rows + matrix section 4 index of **96** `page.tsx` routes ↔ APIs), [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md) (per-route wave, responsive class, status), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md) (R1–R20). These three are **living gates**: they must stay current for execution to remain auditable.

---

## 1. Executive Summary

Beautonomi will **replace the embedded Next.js App Router admin UI** (~96 pages) with a **standalone SPA** while **freezing the public contract** of `/api/admin/*` for the migration window. Delivery is **wave-based** with a **non-negotiable API parity matrix** completed **before** page rewrite begins (per wave), **auth/session documented and implemented first**, **quality gates per page**, and a **flagged cutover with a rollback matrix** (not a single vague “flip flag”). This blueprint binds engineering, platform/security, product operations, and QA to shared artifacts and exit criteria so the migration is **auditable, reversible, and operationally visible**.

**Execution completeness:** Nothing ships on faith—every wave maps to **tracker rows**, **matrix Reviewed APIs**, **test strategy gates**, **cutover rollback paths**, and **risk mitigations**. Section 2c states **pre-flight** work; section 8 enumerates **all waves**; section 19 is the **master execution checklist** (kickoff → cutover).

---

## 2. Strategic Rationale

| Decision | Rationale |
|----------|-----------|
| **Dedicated SPA** | Isolates ~96 admin views + heavy maps/charts/tables from consumer/provider bundles; enables aggressive code-splitting, independent deploy cadence, and clearer separation between **UI** and **API contract**. |
| **Keep `/api/admin/*` stable** | Minimizes backend blast radius; `requireAdminSection` and tenant scoping in `apps/web/src/lib/supabase/api-helpers.ts` + `resolveAdminApiTenantId` remain authoritative for authorization. |
| **Wave-based rewrite** | Reduces “half-migrated” operational risk versus random page order; each wave has **exit criteria** and **sign-off** before the next wave starts. |
| **Full parity expectation** | Every legacy page either has a **migrated equivalent** with verified parity or an explicit **product deprecation** signed by Product + Ops (default: **no silent removals**). |
| **Same-origin SPA (default)** | Admin session today flows through same-site browser behavior (see `apps/web/src/lib/http/fetcher.ts`); **avoid CORS + third-party cookie** complexity. |

**Explicit non-goals (Phase 1–2):**

- Rewriting `/api/admin/*` handlers for “nicer” shapes unless tracked as a **contract version** in the parity matrix with dual support or a breaking-change window.
- Native **Expo** superadmin client.
- Decommissioning Next.js admin APIs in favor of a new BFF **without** a separate program phase and security review.

---

## 2a. Assumptions and constraints (mandatory)

The program **assumes** the following unless formally changed via EM + Platform sign-off:

| # | Assumption |
|---|------------|
| A1 | **Admin is deployed on the same registrable origins** where `apps/web` already serves the market (multi-tenant hosts). Each origin has its **own** cookie jar; SPA and `/api/*` are **same-origin per market**. |
| A2 | **No new PII processing model** — admin remains staff-only; logging/redaction policies unchanged. |
| A3 | **`/admin` and child routes are not indexed** — `robots` / `noindex` policy applied (implementation in Next host or SPA meta; tracked in cutover checklist). |
| A4 | **Monorepo** uses **pnpm**; `apps/admin-web` is a **first-class workspace package** with **CI** job `admin-web:lint`, `admin-web:typecheck`, `admin-web:test`, `admin-web:build`. |
| A5 | **Database schema migrations** unrelated to admin API contract **continue** but any change touching `/api/admin/*` behavior follows **API governance** in Section 6. |
| A6 | **Shell parity**: every **interactive** element in current `AdminShell` (nav, search, notifications, superadmin scope, user menu) has an explicit **matrix row** or a **Wave 0 “shell gap”** ticket before cutover. |

**If A1 is false** (e.g. global admin on a single central host only), rewrite Section 3.7 and `ADMIN_SPA_AUTH_DECISION.md` before implementation.

---

## 2b. Critical path, throughput, and schedule guardrails

**Weakness addressed:** 90 days + 96 pages + Wave 0 overload is optimistic for a small team.

**Minimum staffing (recommended for 90-day full parity):**

| Role | FTE (min) |
|------|-----------|
| Senior FE (SPA + migration) | **2.0** |
| Platform / security liaison | **0.35** |
| QA automation | **0.5** |
| BE on-call (API governance) | **0.2** |
| EM / DRI | **0.25** |

**If staffing < above:** EM must choose **one** path within one week of kickoff: **(1)** extend program to **120 days**, **(2)** **merge waves** (fewer sign-off gates, higher risk), or **(3)** **descope** pages with written Product deprecation list.

**Parallel tracks (Week 1–4):**

| Track | Deliverable | Gate |
|-------|-------------|------|
| **A — Platform** | `apps/admin-web` skeleton, router, auth flow stub, CI, Sentry DSN | **Merge gate G0:** builds green on CI |
| **B — Matrix** | Shell + Wave 1 rows in `ADMIN_API_PARITY_MATRIX.md` → `Reviewed` | **Gate G1:** FE + BE sign-off |
| **C — API** | `GET /api/admin/bootstrap` merged (or approved substitute documented) | **Gate G2:** Security sign-off on auth doc |

**Rule:** No **Wave 1 page** enters `In progress` until **G0 + G1 (for that page’s APIs) + G2** are satisfied.

**Slip trigger:** If **G2** slips **>7 calendar days** from plan, EM **must** convene review and adjust **Section 17** dates (do not silently compress testing).

---

## 2c. Pre-flight (before Wave 0 application code)

Complete these so execution does not stall on missing inventory or ambiguous ownership:

| # | Task | Output | Owner |
|---|------|--------|-------|
| PF1 | Run `node docs/scripts/generate-admin-route-taxonomy.mjs` | Fresh `docs/admin-api-route-taxonomy.csv` | BE / EM |
| PF2 | Reconcile **server** routes with matrix: every matrix section 4 row’s APIs have a matching `apps/web/src/app/api/admin/**/route.ts` or an explicit **gap** row | Matrix changelog entry | FE + BE |
| PF3 | **Nav audit:** `AdminShell.tsx` `navGroups` hrefs ↔ existing `page.tsx` (no dead links); note `superadminOnly` items | Tracker “Nav” column accurate | FE |
| PF4 | **Redirect routes** (`/admin/pricing-plans`, `/admin/sms-templates`, `/admin/email-templates`, `/admin/control-plane`, `/admin/settings/integrations/analytics`): document SPA behavior (client redirect vs server) in parity matrix + [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md) | Cutover doc updated | FE |
| PF5 | **Child components:** grep `apps/web/src/components/admin` for `/api/admin` (explore table, service-zone map, etc.); attach to parent page rows or sub-rows in matrix | Matrix section 4 notes + risk R20 mitigated | FE |
| PF6 | **Dual feature-flag UIs** (`/admin/settings/feature-flags` vs `/admin/control-plane/feature-flags`): product decision on SPA v1 canonical surface; until merged, **both** have Reviewed matrix rows | PM + FE |
| PF7 | Bootstrap contract: `GET /api/admin/bootstrap` spec approved **or** documented interim (G2) | `ADMIN_SPA_AUTH_DECISION.md` | Security + Platform |

**Gate:** PF1–PF3 are **done** before declaring **G1** satisfied for Wave 1. PF4–PF6 may proceed in parallel with W0.1–W0.2 but **must** be done before production cutover.

---

## 3. Target Architecture

### 3.1 Monorepo placement

| Item | Opinionated choice |
|------|---------------------|
| **New package** | `apps/admin-web/` — **Vite + React + TypeScript** (standard for internal dashboards; fast HMR; simple static output for edge/nginx). |
| **Shared libraries** | `@beautonomi/types` for DTOs where they exist; **`packages/admin-api-client`** for HTTP + admin scope query params (mirror `withAdminScope` in `fetcher.ts`); **`packages/admin-access`** exporting **`canAccessSection`**, `ALL_ADMIN_ROLES`, section constants — **single implementation** consumed by SPA and (after refactor) by Next.js **server components or tests** so **RBAC cannot drift**. |

**RBAC rule:** Do **not** copy-paste `admin-sections.ts` logic into SPA; **move or re-export** from `packages/admin-access` and update `apps/web/src/lib/admin-sections.ts` to import from that package (refactor can land in Wave 0 or immediately before SPA consumes it).

### 3.2 Routing model

- **Client-side router** (e.g. React Router v6): paths **mirror** legacy URLs (`/admin/dashboard`, `/admin/providers`, …) so bookmarks and docs stay valid post-cutover.
- **Base path**: production base **`/admin`**; Vite `base: '/admin/'` (or hosting equivalent). **Hashed asset names** for cache busting on each deploy.

### 3.3 Shell / layout model

- **Single app shell**: sidebar / mobile sheet, top bar, global search, **NotificationsDropdown parity**, superadmin **scope** controls — **localStorage keys must match** existing `ADMIN_SCOPE_*` keys used by `fetcher.ts`.
- **Section-aware nav**: driven by `packages/admin-access` + effective section matrix from `GET /api/admin/settings/section-permissions`.

### 3.4 Typed API client strategy

- **Source of truth:** `ADMIN_API_PARITY_MATRIX.md` → endpoint registry in `admin-api-client` (no ad-hoc `/api/admin` strings in page components).
- **Client:** `createAdminApiClient({ credentials: 'include', baseUrl })` with typed methods per resource; Zod parse at boundary for **critical** responses (see test strategy).

### 3.5 Authentication / session (summary; detail in `ADMIN_SPA_AUTH_DECISION.md`)

- **Default:** **Same-origin** + **cookie session** + `fetch(..., { credentials: 'include' })` for `/api/admin/*`.
- **Bootstrap:** `GET /api/admin/bootstrap` (G2) — **401** → `/admin/login?next=…`.
- **403:** Permission UI — never “empty data” for forbidden.

### 3.6 Permission / bootstrap strategy

1. Bootstrap → identity + `role`.  
2. `role ∈ ALL_ADMIN_ROLES`? Else redirect to public home.  
3. Load `sectionRoles` → compute nav with `canAccessSection` from **`packages/admin-access`**.  
4. Route guard: required section(s) from matrix per route.

### 3.7 Same-origin serving & reverse proxy

**Default production pattern:**

- Origin = market web origin; Next serves `/api/*`; static SPA served under `/admin/` with **fallback to `index.html`** for non-file routes.
- **CDN:** If static assets are CDN-fronted, **cutover runbook** must include **cache purge or versioned asset URLs** (hashed filenames cover HTML reference updates; HTML itself may need short TTL).

**Subdomain decision tree (forced recommendation):**

1. **Default:** **Same origin** as `apps/web` for that market.  
2. **Use subdomain** only if Platform mandates central admin host — then **mandatory**: `ADMIN_SPA_AUTH_DECISION.md` appendix with cookie `Domain`, `Secure`, `SameSite=None` (if cross-site), CORS allowlist, and **Security re-approval**.

### 3.8 Relationship to `/api/admin/*`

- SPA talks only to Next APIs (+ Supabase auth as documented). **No business logic duplication.**

### 3.9 Legacy `/admin/*` (Next App Router)

**Decision (forced for cutover planning):**

- **Before production cutover:** Replace `app/admin/**` with either **(1)** a **single** `app/admin/[[...slug]]/page.tsx` that serves a **minimal host** (loads SPA bundle) or **(2)** pure static hosting off Next. **Pick one** in the first PR that touches production routing; document in `ADMIN_SPA_CUTOVER_PLAN.md`.
- **After cleanup milestone:** delete obsolete React page implementations; keep only what infra requires.

---

## 4. Key Decisions and Recommendations

1. **SPA framework:** Vite + React in `apps/admin-web/`.  
2. **Hosting:** **Same origin** per market; subdomain only per Section 3.7 tree + security appendix.  
3. **API contract:** **Frozen** during waves; changes require matrix + BE reviewer + release note.  
4. **Auth transport:** Cookies + `credentials: 'include'`.  
5. **Bootstrap:** `GET /api/admin/bootstrap` — **G2 before Wave 1**.  
6. **Feature flag (forced tiers):**  
   - **Tier A (preferred):** Runtime flag readable by edge/host (e.g. **Vercel Edge Config**, **Redis**, **LaunchDarkly**) — toggles **routing** or **HTML shell** without rebuild.  
   - **Tier B (acceptable):** Redeploy with env var — rollback = **redeploy previous artifact** within RTO; **must** keep last-known-good image in registry.  
   - **Tier C (not allowed for prod cutover):** `NEXT_PUBLIC_*` **only** if combined with **Tier A/B** for kill switch (build-time flags alone are **insufficient** as sole rollback).  
7. **Nav counts + dashboard:** Fixed in **Wave 0** (permission alignment documented in matrix).  
8. **RBAC source:** `packages/admin-access` — **no duplicate** client-side matrix.

---

## 5. Scope and Non-Goals

**In scope:** New SPA, `admin-api-client`, `admin-access` package, waves, matrix, tests, cutover, observability, `proxy.ts` updates, `noindex` for admin.

**Out of scope (without new program):** New IdP, wholesale API redesign, Expo superadmin.

---

## 6. API Parity and Contract Plan

**Rule:** **No SPA page development starts until** that page’s rows in `ADMIN_API_PARITY_MATRIX.md` are **`Reviewed`** (FE + BE).

The matrix **must** include, **per admin UI page**:

| Column | Required |
|--------|----------|
| Legacy route | e.g. `/admin/providers` |
| Wave | W0–W5 |
| Owner | Engineer handle |
| Every API called | Method + path, e.g. `GET /api/admin/providers` |
| AuthZ | `requireAdminSection` section(s); superadmin-only flags |
| Request params | query/body fields, pagination, filters, sort |
| Response shape | Type reference or JSON schema pointer |
| Error codes | 401/403/404/409/500 user messaging |
| Gaps | Missing/underpowered endpoints, inconsistencies |
| Client method | Name in `admin-api-client` registry |

**Shell / global (Wave 0):** Every `fetch` in `apps/web/src/components/admin/AdminShell.tsx`, `apps/web/src/components/admin/NotificationsDropdown.tsx`, and related shell components **must** have matrix rows before shell is “parity signed.”

**Beyond page-level grep:** Matrix rows **must** cover API usage in **child components** (e.g. `ExploreModerationTable`, service-zone map panels) under `apps/web/src/components/admin/**`—link them to the parent route in [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md) or add a sub-table. **Route patterns:** **Hub-only** pages (no direct `/api/admin` calls, e.g. `/admin/reports`, `/admin/control-plane/overview`) still need a row stating **no APIs** and listing **child destinations**. **Redirect-only** routes need a row describing **target URL** and SPA router behavior (see risk R19).

**Repo automation (required):**

- Run `docs/scripts/generate-admin-route-taxonomy.mjs`; grep `apps/web/src/app/admin` for `"/api/admin` and `fetcher.` usage to **seed** the matrix; owners **manually verify** against each `route.ts`.

**Contract testing (required):**

- Minimum: **Zod** (or equivalent) at client boundary for **critical** responses per wave.  
- Stretch: OpenAPI + schemathesis against staging.

**Governance:** Any change to `/api/admin/*` during migration requires **matrix row update** + **release note** + **BE reviewer**.

---

## 7. Auth and Session Plan

Canonical: `ADMIN_SPA_AUTH_DECISION.md` — must include **multi-origin** login (per market), **CSP** delta for SPA scripts, and **flag tier** alignment.

---

## 8. Wave-Based Migration Plan

**Tracker:** [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md) — **96** legacy paths; each PR that migrates a page **updates the tracker row** in the same PR.

**Wave map (complete):** Every route is listed in [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md) section 4 with a **matrix row #** (1–96). Waves below match the tracker.

### Wave 0 — Platform + shell (blocking)

**Routes (6):** `/admin` (redirect), `/admin/login`, `/admin/dashboard`, `/admin/gods-eye`, `/admin/analytics`, `/admin/reports` (hub).

**Decomposed (addresses overload):**

| Sub-deliverable | Outcome | Sign-off |
|-----------------|---------|----------|
| W0.1 CI + skeleton | `apps/admin-web` builds; lint/typecheck/test in CI | FE lead |
| W0.2 Auth + bootstrap | Login + bootstrap + 401/403 UX | Platform + Security |
| W0.3 Shell | Nav, mobile sheet, search, **notifications** (`/api/admin/activity`), **superadmin scope**, parity with `AdminShell` fetches | Design + FE |
| W0.4 Dashboard + counts | Parity with legacy **including** `admin_support` vs API alignment; **nav-counts** / **section-permissions** behavior per matrix | QA |

**Exit:** G0–G2 + W0.1–W0.4 complete; **no Wave 1** until EM signs wave exit.

### Wave 1 — Support + providers & operations (12 routes)

**Scope:** Matrix section 4 rows **7–18** — support tickets (list + detail), providers (list + detail + distance settings), staff, bookings (list + detail), reviews, disputes, user reports, refunds.

**Exit criteria:** All W1 matrix rows `Reviewed`; E2E smoke on ticket + provider + booking flows per [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md); tracker rows **Done** or **Parity signed**.

### Wave 2 — Finance + reports (17 routes)

**Scope:** Matrix section 4 rows **19–35** — finance, payouts, fees, billing, taxes, platform fees, plans / subscription / pricing (including redirect `/admin/pricing-plans` → `/admin/plans`), provider subscriptions, subscription revenue, and all `/admin/reports/*` report pages (revenue, bookings, providers, customers, gift cards, Yoco reconciliation).

**Exit criteria:** Financial report exports and payout-sensitive actions covered by tests where marked **critical** in matrix.

### Wave 3 — Users & trust + content + catalog + e‑commerce (12 routes)

**Scope:** Matrix section 4 rows **36–47** — users (list + detail), verifications, audit logs, content, learning, catalog, explore (+ embedded moderation table), addons, e‑commerce orders / returns / products.

**Exit criteria:** Impersonation / password / export flows documented and tested per matrix; content/catalog API surface fully enumerated (highest variety).

### Wave 4 — Marketing + integrations + operations (21 routes)

**Scope:** Matrix section 4 rows **48–68** — promotions, loyalty, gamification (point rules, badges), gift cards, notifications, broadcast, automations, notification templates, redirects (SMS/email templates, analytics settings), webhooks, API keys, Amplitude, Mapbox, ISO codes, **Market Coverage** (service zones, superadmin-only), system health, monitoring, security.

**Exit criteria:** Map-heavy routes (service zones, Mapbox) meet responsive **M3/M4** bar in tracker; CSP/load tested in staging where applicable.

### Wave 5 — Platform config + control plane (28 routes)

**Scope:** Matrix section 4 rows **69–96** — settings (main, referrals, app version, feature flags, team permissions, tenant domains), custom fields, full **control-plane** subtree (overview hub, feature flags, integrations Sumsub/Gemini/Aura, modules ads/AI/on-demand/ranking/distance/safety, safety logs, maintenance + sign-ups, audit log), plus control-plane root redirect.

**Exit criteria:** Superadmin-only surfaces (`tenant-domains`, team permissions matrix) signed by Security + PM; config-change audit readable in SPA.

### Cross-wave execution rules

**Parallelism:** Within a wave, **multiple pages** may be `In progress` **only if** they do not share a **Blocked** API dependency; EM resolves conflicts.

**Order of work per page:** (1) Matrix APIs → `Reviewed` → (2) Tracker `In progress` → (3) SPA implementation → (4) Tests per strategy → (5) Tracker `Done` / `Parity signed`.

**Spill:** If a wave misses exit by **>5 business days**, EM triggers **risk review** ([`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md)) and updates the timeline (section 17).

---

## 9. UI/UX Conventions

Canonical: `ADMIN_SPA_UI_CONVENTIONS.md`.

---

## 10. Responsive Strategy

Responsive class **per page** is recorded in [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md). Use this baseline (align with [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md) section 4 for tables):

| Class | Typical UI | Examples (legacy) |
|-------|------------|-------------------|
| **M1** | Hub / few links, minimal data | `/admin/reports` hub, redirect-only routes |
| **M2** | Standard tables, forms, filters | Most list pages |
| **M3** | Multi-panel, tabs, heavy modals | Plans, settings, provider detail |
| **M4** | Maps, large charts, map + table | Gods Eye, service zones |

**Execution rule:** SPA implementation **must not** downgrade mobile behavior vs tracker class without Design + EM approval (update tracker + matrix parity notes).

---

## 11. Testing and Quality Gates

Canonical: `ADMIN_SPA_TEST_STRATEGY.md`.

**Add:** **CSP violation** monitoring in staging before prod (report-only mode).

---

## 12. Cutover and Rollback Plan

Canonical: **`ADMIN_SPA_CUTOVER_PLAN.md`** (V2.1 expanded).

Must include: **T-24h / T-1h / T0 / T+1h** checklist, **rollback matrix** (legacy present vs removed), **cache** behavior, **Tier A/B** flag ops.

---

## 13. Observability and Operational Readiness

**Before first user-facing SPA traffic:**

- **Sentry** for `apps/admin-web` with **release = git SHA** (match web pattern).  
- **API:** 5xx rate on `/api/admin/*`; **401/403 ratio** on bootstrap (not only volume).  
- **Synthetic:** `GET /admin` + **one authenticated** check (staging service account or cookie vault).  
- **CSP:** Report-Only phase in staging; enforce post-cutover or document exceptions.  
- **Web Vitals / RUM** (optional): LCP for `/admin` logged to same pipeline as `apps/web` if available.

---

## 14. Team Execution Model

**Branching:** Long-lived `feature/admin-spa` or **trunk-based** with feature flags — EM picks one; **document** in repo contributing guide.

**API freeze:** Default **reject** non-P0 API changes; weekly triage.

**If team < Section 2b minimum:** Execute **scope/date** path within one week.

---

## 15. Risk Register Summary

**Full table:** [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md) — **R1–R20** (includes RBAC drift, CSP, asset cache, staffing, shell gaps, **dual feature-flag UIs**, **redirect / SPA routing**, **child-component API gaps**).

| Risk | L | I | Mitigation | Owner |
|------|---|---|------------|-------|
| Auth/session breaks in prod | M | H | Same-origin; staging burn-in; bootstrap monitoring | Platform |
| API parity gaps | H | H | Matrix gate; contract tests | EM |
| Half-migrated features | M | H | Wave exits; runtime flag tier A/B | EM |
| **RBAC drift** (SPA vs Next) | M | H | **`packages/admin-access`** single source | FE |
| **CSP** blocks SPA | M | M | Report-Only → enforce; nonce policy | Platform |
| **Cache** serves stale SPA | M | M | Hashed assets; HTML TTL; purge runbook | DevOps |
| Rollback fails | L | H | Rollback matrix; keep artifact | DevOps |
| **Staffing** vs 90-day scope | H | M | Section 2b guardrail (120-day / descope) | EM |
| **Duplicate flag UIs / redirect parity** | M | M | PF4–PF6; R18–R19 in register | PM + FE |

**Cadence:** Weekly review of open risks; **High** impact escalated per register.

---

## 16. Required Supporting Artifacts

| Artifact | Purpose | Owner | Due |
|----------|---------|-------|-----|
| `ADMIN_SPA_MIGRATION_PLAN_V2.md` | Master blueprint (this file) | EM | T0 |
| `ADMIN_SPA_REDLINE_V2_TO_V2.1.md` | Changelog of blueprint hardening | Architect | V2.1 |
| `ADMIN_API_PARITY_MATRIX.md` | Contract gate | FE + BE | Before page work |
| `ADMIN_SPA_AUTH_DECISION.md` | Approved auth | Security | G2 |
| `ADMIN_SPA_TEST_STRATEGY.md` | QA gates | QA | Before W1 |
| `ADMIN_SPA_UI_CONVENTIONS.md` | UX law | Design | Before W1 |
| `ADMIN_SPA_CUTOVER_PLAN.md` | Ops runbook | DevOps | Pre-staging cutover |
| `ADMIN_SPA_WAVE_TRACKER.md` | Status | PM/EM | Living |
| `ADMIN_SPA_RISK_REGISTER.md` | Risks | EM | Living |

**Seeded execution data:** As of **2026-04-05**, the parity matrix section 4, wave tracker, and risk register (R18–R20) were **seeded from the repo** (96 routes, `AdminShell` nav, API greps). Regenerate taxonomy and re-grep when large admin refactors land.

---

## 17. Next 30 / 60 / 90 (and 120) Day Plan

| Horizon | Deliverables |
|---------|--------------|
| **30 days** | G0–G2 complete; W0.1–W0.4 complete; matrix **shell + Wave 1** rows `Reviewed`; Sentry + CSP report-only on staging; **Tier A or B** flag **proven** on staging. |
| **60 days** | Waves **0–2** signed; staging **default SPA**; contract tests for **top 20** endpoints; **cutover dry-run** (including rollback drill). |
| **90 days** | Waves **3–5** complete **or** formal slip to 120 days per Section 2b; production cutover **if** all exit criteria green. |
| **120 days (contingency)** | Full **96-page parity** + legacy removal if 90-day slip triggered. |

---

## 19. Master execution checklist (program-level)

Use this as the **definition of “ready”** at each phase. Details live in linked artifacts.

### Phase A — Program kickoff (week 0)

- [ ] Section 2b staffing decision recorded (90 / 120 / descope path).
- [ ] Section 2c **PF1–PF7** assigned; PF1–PF3 scheduled before G1.
- [ ] Flag tier (section 4 key decision 6) chosen for staging proof.
- [ ] `ADMIN_SPA_RISK_REGISTER.md` reviewed; owners named for R1–R20.

### Phase B — Wave 0 complete (G0–G2 + W0.1–W0.4)

- [ ] `apps/admin-web` CI green (G0).
- [ ] Bootstrap live or interim documented (G2).
- [ ] Matrix shell rows + `NotificationsDropdown` + `AdminShell` fetches **Reviewed**.
- [ ] Tracker W0 rows **Done** / **Parity signed** per test strategy.

### Phase C — Each wave 1–5

- [ ] **Before coding:** All routes in that wave have matrix **Reviewed** for APIs used (including child components).
- [ ] **During:** Tracker status updated in same PR as SPA work.
- [ ] **After wave:** EM wave exit sign-off in tracker; risk register updated if spill.

### Phase D — Pre-production cutover

- [ ] `ADMIN_SPA_CUTOVER_PLAN.md` T-minus checklists dry-run completed.
- [ ] Rollback matrix tested (flag off + artifact revert).
- [ ] PF4 redirect behavior verified for SPA deep links.
- [ ] Observability (section 13) in place (Sentry, synthetics, CSP).

### Phase E — Post-cutover

- [ ] Legacy admin code removal per section 3.9 milestone (documented).
- [ ] Closed risks archived in register; retrospective notes in matrix changelog.

---

## Document control

| Version | Date | Notes |
|---------|------|--------|
| V2.0 | 2026-04-06 | Initial blueprint |
| V2.1 | 2026-04-06 | Critical review: assumptions, RBAC package, flag tiers, W0 split, cutover T-x, risks, staffing guardrail, 120-day contingency |
| V2.1.1 | 2026-04-05 | Execution pack: section 2c pre-flight, full W0–W5 scope (matrix section 4), responsive table, risks R18–R20, section 19 master checklist |

**Review cadence:** Weekly during migration; **mandatory re-approval** after auth, cutover, or flag-tier change.

**Section numbering:** Section **18** is reserved for a future appendix so timeline references to section 17 stay stable.
