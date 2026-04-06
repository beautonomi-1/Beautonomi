# Admin platform regression guardrails

This document defines **critical workflows**, **automated checks**, and a **PR checklist** so admin changes do not silently regress routing, auth, UX states, or API contract hygiene.

The canonical list of flows lives in code: `apps/admin-web/src/regression/criticalFlows.ts` (`CRITICAL_ADMIN_FLOWS`). Update that file when the critical set changes, then reflect the change here.

---

## 1. Critical admin workflows

| # | ID | Route (under `/admin`) | Page module | RBAC |
|---|----|------------------------|-------------|------|
| 1 | login | `login` | `routes/LoginPage.tsx` | public |
| 2 | dashboard | `dashboard` | `routes/DashboardPage.tsx` | section |
| 3 | bookings | `bookings` | `routes/bookings/BookingsPage.tsx` | section |
| 4 | providers | `providers` | `routes/providers/ProvidersListPage.tsx` | section |
| 5 | support-tickets | `support-tickets` | `routes/SupportTicketsPage.tsx` | section |
| 6 | payouts | `payouts` | `routes/finance/PayoutsPage.tsx` | section |
| 7 | users | `users` | `routes/users/UsersListPage.tsx` | section |
| 8 | feature-flags | `settings/feature-flags` | `routes/settings/FeatureFlagsListPage.tsx` | section |
| 9 | gods-eye | `gods-eye` | `routes/GodsEyePage.tsx` | superadmin |
| 10 | analytics | `analytics` | `routes/AnalyticsPage.tsx` | superadmin |
| 11 | audit-logs | `audit-logs` | `routes/users/AuditLogsPage.tsx` | section |
| 12 | control-plane-overview | `control-plane/overview` | `routes/control-plane/ControlPlaneOverviewPage.tsx` | superadmin |
| 13 | broadcast-compose | `broadcast/compose` | `routes/marketing/BroadcastComposePage.tsx` | section |
| 14 | team-permissions | `settings/team-permissions` | `routes/settings/TeamPermissionsMatrixPage.tsx` | superadmin |
| 15 | tenant-domains | `settings/tenant-domains` | `routes/settings/TenantDomainsListPage.tsx` | superadmin |
| 16 | service-zones | `service-zones` | `routes/ops/ServiceZonesListPage.tsx` | superadmin |
| 17 | referral-sources | `referral-sources` | `routes/providers/ReferralSourcesPage.tsx` | section |
| 18 | ecommerce-overview | `ecommerce` | `routes/ecommerce/EcommerceOverviewPage.tsx` | section |

**RBAC meaning (for static tests):**

- **public** — login only; must **not** use section or superadmin page hooks.
- **section** — must use `useAdminSectionPage` (or equivalent section gate pattern enforced by tests).
- **superadmin** — must use `useSuperadminPage` on each superadmin-only route (e.g. Gods Eye, Analytics, control plane overview, team permissions, tenant domains, market coverage).

---

## 2. Coverage layers

### 2.0 Sidebar nav ↔ `App.tsx` (Vitest)

**Location:** `apps/admin-web/src/regression/navRoutesRegression.test.ts`

**Intent:** Every `href` in `config/nav.ts` has a matching `<Route path="…" />` (including `control-plane/*` children and the `custom-fields` alias) so sidebar links never 404.

### 2.1 Route-level smoke (Vitest)

**Location:** `apps/admin-web/src/regression/adminRouteSmoke.test.ts`

**Intent:** Every critical `appPath` is registered in `App.tsx` (flat `path="a/b"` or nested under `control-plane/*`) so renamed or dropped routes fail CI immediately.

**Run (repo root):**

```bash
pnpm --filter admin-web test
```

### 2.2 Role / permission guardrails (Vitest)

**Location:** `apps/admin-web/src/regression/authGuardRegression.test.ts`

**Intent:** Login stays free of section hooks; section flows use the section page hook; superadmin-only flow uses the superadmin hook. This is a **structural** guard, not a substitute for server-side authorization.

**Run:** same as §2.1.

### 2.3 Loading / error UX heuristics (Vitest)

**Location:** `apps/admin-web/src/regression/loadingStateRegression.test.ts`

**Intent:** Critical pages retain obvious async UX signals (e.g. skeleton, query/retry, loading flags, or `PermissionDenied`); login retains alert + sign-in affordances. **Heuristic** — it catches gross regressions (blank pages), not every edge case.

**Run:** same as §2.1.

### 2.4 Basic E2E (Playwright)

**Location:** `apps/admin-web/e2e/login-shell.spec.ts`  
**Config:** `apps/admin-web/playwright.config.ts` (Vite preview, base URL `/admin/`)

**Intent:**

- Login shell renders expected heading, labels, and sign-in control.
- Hitting a protected route **without** a live Next API still shows **some** gate UX (verifying session, session error copy, or login), not a silent blank app.

**Run:**

```bash
cd apps/admin-web
pnpm test:e2e:install   # once per machine / CI image
pnpm test:e2e
```

**Staging / real auth:** For full signed-in journeys (RBAC matrix, mutations), extend Playwright with a staging base URL and credentials or a test harness; the current suite is intentionally minimal and backend-agnostic.

---

## 3. CI integration

Workflow: `.github/workflows/ci.yml`

| Stage | Check |
|--------|--------|
| After typecheck | `pnpm --filter admin-web test` (includes regression Vitest) |
| After typecheck | `node apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs` |
| After admin-web build | `playwright install chromium --with-deps` then `pnpm exec playwright test` from `apps/admin-web` |

### 3.1 Admin API route ↔ taxonomy alignment

**Script:** `apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs`

**Rule:** Every `apps/web/src/app/api/admin/**/route.ts` (or `route.tsx`) must correspond to a path listed in `docs/admin-api-route-taxonomy.csv` (first column, `/api/admin/...`). Adding a new admin API route without updating the taxonomy **fails CI**.

**Run (repo root):**

```bash
node apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs
```

---

## 4. Limitations (explicit)

- **Auth tests are static** — they enforce hook usage patterns, not that the backend denies cross-tenant access.
- **Loading tests are heuristic** — they grep for common patterns; novel UX must keep a recognizable signal or extend the test allowlist.
- **E2E without API** — does not validate happy-path data loading; pair with staging E2E or manual smoke for releases.
- **Taxonomy CSV** — ensures registration and traceability; it does not replace OpenAPI/schema tests if those exist elsewhere.

---

## 5. No-regression checklist (for PRs touching admin)

Use this when changing routes, pages, API clients, or admin Next routes.

- [ ] **Routes:** If adding/removing/renaming an admin page route, update `App.tsx` and, if it is (or should be) a **critical** flow, update `CRITICAL_ADMIN_FLOWS` in `criticalFlows.ts` and this doc’s table.
- [ ] **Guards:** New protected pages use `useAdminSectionPage` (or the approved section pattern); superadmin-only surfaces use `useSuperadminPage`. Login path stays `public` and must not pull section hooks.
- [ ] **UX:** New or heavily edited list/detail pages expose loading and error states (skeletons, retry, inline error, or permission denied) — enough to satisfy `loadingStateRegression.test.ts` or adjust tests with justification.
- [ ] **API:** New `apps/web/.../api/admin/.../route.ts` entries have a row in `docs/admin-api-route-taxonomy.csv`; client usage aligns with documented contract expectations (see also parity/matrix docs if applicable).
- [ ] **E2E:** If login shell or global gate UX changes, update `e2e/login-shell.spec.ts` (or add a focused spec).
- [ ] **Local CI parity:** `pnpm --filter admin-web test` and `node apps/admin-web/scripts/check-admin-api-routes-in-taxonomy.mjs` pass; after build, `pnpm test:e2e` in `apps/admin-web` passes.

---

## 6. Related references

- Critical flow registry: `apps/admin-web/src/regression/criticalFlows.ts`
- Admin API taxonomy: `docs/admin-api-route-taxonomy.csv`
- CI: `.github/workflows/ci.yml`
