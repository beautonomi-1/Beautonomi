# Wave 1 execution checklist (admin SPA)

**Purpose:** Single handoff artifact for the **next execution cycle**: what must happen before and during **Wave 1** (support + providers & operations surfaces per `ADMIN_SPA_MIGRATION_PLAN_V2.md` and `ADMIN_API_PARITY_MATRIX.md` §4 rows **7–18**).

**Owner:** EM (DRI); FE + BE execute; QA signs exit.

**Related:** [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md), [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md).

---

## 0. Wave 0 verification gate (must complete first)

Per migration plan §2 **G0** and tracker rule (“Wave N+1 may not enter `In progress` until Wave N exit criteria met”):

| # | Gate | Evidence |
|---|------|----------|
| 0.1 | **CI green** for `admin-web` + `@beautonomi/admin-access` + `@beautonomi/admin-api-client` | `turbo` typecheck / lint / test / build on `develop` |
| 0.2 | **Bootstrap + auth** behave per [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md) | Manual or automated: 401 → login `?next=`; 403 → not-admin UI; sign-in + bootstrap + section permissions load |
| 0.3 | **Shell smoke** (`ADMIN_SPA_TEST_STRATEGY.md` §2.1 intent) | At minimum: open SPA `/admin/login` → `/admin/dashboard` with valid admin session (Vite + Next proxy); no console errors on shell |
| 0.4 | **Matrix shell rows** (§3) | Move to **Reviewed** only with **FE + BE** sign-off on each row, or explicitly defer a row with dated “shell gap” note in matrix + tracker |
| 0.5 | **G2 bootstrap** | Security/process: [`ADMIN_SPA_AUTH_DECISION.md`](./ADMIN_SPA_AUTH_DECISION.md) approval block progressed or exception documented by Platform EM |
| 0.6 | **Tracker** | Mark W0 rows **Done** (or **In review** with PR link) only when 0.1–0.4 satisfied; **Parity signed** when QA signs per test strategy |

**Do not start Wave 1 SPA page work until 0.1–0.4 are satisfied** (0.5 per org discipline). Exception: **matrix-only** work (§1 below) may proceed in parallel with 0.4 if it does not claim Reviewed until reviewed.

---

## 1. Parity matrix prep for Wave 1 (G1)

No SPA feature coding for a page until that page’s matrix depth is **Reviewed** (`ADMIN_SPA_MIGRATION_PLAN_V2.md` §6).

For **each** legacy path in §2, complete matrix §5-style rows (or equivalent sub-table): every `/api/admin/*` used by the page, AuthZ, query/body, response notes, client method / Zod test id.

**Suggested batching (parallelizable review work):**

| Batch | Matrix §4 rows | Theme |
|-------|----------------|-------|
| A | 7–8 | Support tickets + detail |
| B | 9–11 | Providers list, detail, distance settings |
| C | 12 | Staff |
| D | 13–14 | Bookings list + detail |
| E | 15–18 | Reviews, disputes, user-reports, refunds |

Different batches can be **Reviewed by different FE/BE pairs** in parallel once scope is clear.

---

## 2. Exact Wave 1 routes / pages (implementation order)

Legacy paths to mirror in React Router (same URLs under `/admin/`). Source: [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md) §4.

| Order | Legacy path | Matrix §4 | Section (nav) | Notes |
|-------|-------------|-----------|---------------|-------|
| 1 | `/admin/support-tickets` | 7 | support | List + filters; entry to W1 |
| 2 | `/admin/support-tickets/[id]` | 8 | support | Depends on list deep links |
| 3 | `/admin/providers` | 9 | providers_operations | List; critical path per test strategy §2.3 |
| 4 | `/admin/providers/[id]` | 10 | providers_operations | Detail from list |
| 5 | `/admin/providers/distance-settings` | 11 | providers_operations | Can follow provider APIs Reviewed |
| 6 | `/admin/staff` | 12 | providers_operations | |
| 7 | `/admin/bookings` | 13 | providers_operations | |
| 8 | `/admin/bookings/[id]` | 14 | providers_operations | Detail from bookings |
| 9 | `/admin/reviews` | 15 | providers_operations | Export parity if legacy exports |
| 10 | `/admin/disputes` | 16 | providers_operations | |
| 11 | `/admin/user-reports` | 17 | providers_operations | |
| 12 | `/admin/refunds` | 18 | providers_operations | |

**Nav wiring:** Add these to `apps/admin-web` router + `nav.ts` only as each page reaches **In review** / **Done**; keep `WavePlaceholderPage` until replaced.

---

## 3. Blockers by severity (living list — update as resolved)

### Critical (stops Wave 1 code or production cutover)

| ID | Blocker | Mitigation owner |
|----|---------|------------------|
| C1 | **W0 exit not verified** (§0) | EM + QA |
| C2 | **Matrix rows for target page not Reviewed** | FE + BE leads |
| C3 | **G2 / auth decision** not approved for production stance | Security + Platform |
| C4 | **Production cutover** or removal of Next `app/admin/**` before SPA parity | Forbidden until separate cutover program |

### High

| ID | Blocker | Mitigation owner |
|----|---------|------------------|
| H1 | **Nav counts AuthZ** mismatch vs sidebar audiences (matrix §7 known issue) | FE + BE — align API or client handling before relying on badges in W1 |
| H2 | **No shared list/table/filter primitives** in SPA | FE — introduce thin primitives per `ADMIN_SPA_UI_CONVENTIONS.md` early in W1 |
| H3 | **Mutating admin APIs** under scoped URLs need body `scope`/`tenant_id` (see matrix Implementation Delta) | Extend `@beautonomi/admin-api-client` when first W1 mutation hits scoped path |

### Medium

| ID | Blocker | Mitigation owner |
|----|---------|------------------|
| M1 | **Activity / notifications** UI lighter than legacy; shell parity sign-off open | Product + FE |
| M2 | **Vitest** quirks for some `apps/web` API tests (environment) | Platform — stabilize harness if blocking bootstrap regression |
| M3 | **Export** flows (reviews, bookings, etc.) — matrix must specify endpoints + auth | BE + FE |

### Low

| ID | Blocker | Mitigation owner |
|----|---------|------------------|
| L1 | **CORS / direct :3000** dev workflows | Document only; default is Vite proxy |
| L2 | Bundle size / code-splitting for heavy tables | FE — lazy routes |

---

## 4. Safe parallelization

| Workstream | Can run in parallel with | Constraints |
|------------|--------------------------|-------------|
| **Matrix Reviewed** batches A–E (§1) | Each other | No double-ownership of same §4 row |
| **`admin-api-client` methods + Zod** per resource | Matrix batch for that resource | Merge order: types/schemas before page PR |
| **SPA list pages** (e.g. support-tickets vs providers) | Each other **after** shared primitives exist | Do not diverge on `admin-access` / scope keys |
| **BE contract tests** / API doc fixes | FE stubs behind feature flag | No breaking `/api/admin/*` without matrix + governance |
| **QA test case authoring** | Matrix review | Tie cases to matrix row ids |

**Serialize:** First **shared** table shell + error/empty/403 patterns; then fan out page teams.

---

## 5. Must **not** start until Wave 0 is verified

| Item | Why |
|------|-----|
| **Implementing W1 routes** in `apps/admin-web` (beyond placeholders) | Plan §2: G0 + G1 (page) + G2 |
| **Marking any W1 tracker row `In progress`** without EM exception | Tracker rule |
| **Production routing** to SPA default | [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md) |
| **Deleting or gutting** Next `app/admin/**` for W1 pages | Dual-stack until cutover |
| **Wave 2+** SPA pages | Wave exit discipline |
| **Assuming `handleApiError` 401** on non-bootstrap routes | Only bootstrap maps unauth to 401; other APIs may still return 403 for “Authentication required” — document per route if SPA depends on status codes |

**Allowed before W0 verification:** matrix deep-dives, design tokens, **non-production** spikes, `admin-api-client` scaffolding **behind** no consumer, CI hardening, taxonomy refresh.

---

## 6. Wave 1 exit (preview for next handoff)

When all tracker rows **7–18** are **Done** (or explicitly deferred with PM sign-off) and test strategy minimums for W1 are met:

- Update [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md) W1 rows + wave sign-off table.
- Refresh matrix changelog + Implementation Delta.
- Runbook: staging `admin-smoke` + `admin-rbac` for **support** + **providers_operations** sections at minimum.

---

## 7. Document control

| Date | Change |
|------|--------|
| 2026-04-07 | **Created** for post–W0 handoff; aligns matrix §4 rows 7–18 and migration plan gates. |
| 2026-04-07 | See [`ADMIN_WAVE1_PATTERN_SET_REPORT.md`](./ADMIN_WAVE1_PATTERN_SET_REPORT.md) for the first **pattern-set** implementation slice (subset of rows 7, 11, 13–14, 16). |
