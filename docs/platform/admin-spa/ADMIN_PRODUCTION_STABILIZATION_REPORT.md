# Admin SPA — production stabilization pass

**Date:** 2026-04-05  
**Scope:** `apps/admin-web`, shared **`@beautonomi/admin-api-client`**, aligned with [`ADMIN_POST_MIGRATION_REVIEW.md`](./ADMIN_POST_MIGRATION_REVIEW.md), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md), [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md).  
**Production monitoring:** No repo-local Sentry export or log dump was available in this workspace; changes are driven by code review, post-migration findings, and risk-register themes (auth, RBAC, observability noise, export/scope parity).

---

## 1. Goals

| Theme | Target |
|--------|--------|
| Auth / session | Eliminate edge-case redirect loops; clearer session boot UX. |
| Permissions | More predictable section-permissions fetch behavior on transient failures. |
| Operational noise | Fewer benign Sentry events; shell queries that fail softly where safe. |
| Exports / scope | Align CSV/binary downloads with **`adminApi`** GET semantics (**`withAdminScopeUrl`** where applicable). |
| Query defaults | Avoid duplicate mutation retries that can amplify write load. |

---

## 2. Changes implemented

### 2.1 Auth / session

| Item | Change |
|------|--------|
| Login **`next` loop | **`safeAdminNextParam`** now maps **`login`** and **`login/*`** → **`dashboard`** so a signed-in user cannot be sent back to **`/login`** indefinitely when `next` points at the login route. |
| **`RequireAuth`** loading | Replaced plain “Loading…” with a **spinner + “Verifying session…”** copy for clearer boot state. |

**Files:** `apps/admin-web/src/routes/LoginPage.tsx`, `apps/admin-web/src/App.tsx`.

### 2.2 Permissions / section matrix

| Item | Change |
|------|--------|
| Section-permissions query | Explicit **`retry`**: no retries on **401/403**; up to **3** attempts for other failures (e.g. transient **5xx**), reducing unnecessary hammering while improving recovery vs a single failure. |

**Files:** `apps/admin-web/src/providers/AdminSessionProvider.tsx`.

### 2.3 Shell: nav counts & activity (noise + UX)

| Item | Change |
|------|--------|
| **Nav counts** | **401/403** already returned `{}`; **5xx** now also returns **`{}`** so the sidebar does not sit in a hard **error** state and TanStack does not keep surfacing a failed query for decorative badges. |
| **Activity** dropdown | **401/403/5xx** return **`{ activities: [] }`** so the bell menu shows **“No recent activity”** instead of **“Activity unavailable”** for many infra/auth blips. **Retry** remains **false** (no storms). |

**Files:** `apps/admin-web/src/components/layout/AdminChrome.tsx`.

**Trade-off:** Operators lose a visible “activity feed failed” signal for **5xx**; counts silently show **0**. Acceptable for **non-critical** chrome; critical pages still use page-level **`AdminRetryBlock`**.

### 2.4 Exports / **`adminApi` parity (R23)**

| Item | Change |
|------|--------|
| **`downloadBlob`** | New **`adminApi.downloadBlob(path)`** in **`@beautonomi/admin-api-client`**: same **credentials**, **timeout**, and **GET `withAdminScopeUrl`** behavior as **`getJson`**. |
| **`downloadAdminBlob`** | Uses **`adminApi.downloadBlob`**; **`BookingsPage`** export uses **`downloadAdminBlob`** (removed raw **`fetch`**). |
| **Public product catalog** | Still uses **`fetch`** to **`/api/public/products`** — **intentional**; inline comment references matrix + this report. |

**Files:** `packages/admin-api-client/src/createAdminApiClient.ts`, `apps/admin-web/src/lib/adminCsvDownload.ts`, `apps/admin-web/src/routes/bookings/BookingsPage.tsx`, `apps/admin-web/src/routes/ecommerce/ProductCatalogPage.tsx`.

**Build note:** Package **`types`** come from **`dist`**; CI/local **`pnpm build`** for **`@beautonomi/admin-api-client`** must run when the client surface changes (`dist/` is gitignored).

### 2.5 TanStack Query defaults

| Item | Change |
|------|--------|
| Mutations | Default **`retry: false`** on **`QueryClient`** to avoid duplicate POST/PATCH attempts on flaky networks (user can retry explicitly where UI exposes it). |

**Files:** `apps/admin-web/src/lib/queryClient.ts`.

### 2.6 Observability (Sentry)

| Item | Change |
|------|--------|
| Environment | **`environment`** = **`VITE_SENTRY_ENVIRONMENT`** ?? **`import.meta.env.MODE`** (separate **staging** / **production** in Sentry). |
| Sampling | **`tracesSampleRate: 0.1`**. |
| Noise | **`ignoreErrors`** for common benign browser patterns; **`beforeSend`** drops **`AdminApiError`** with status **401** or **403** (expected auth flows should not page on-call). |

**Files:** `apps/admin-web/src/main.tsx`, `apps/admin-web/.env.example`.

---

## 3. Risk register mapping

| ID | Relationship to this pass |
|----|---------------------------|
| **R1** | Unchanged; still validate cookies on integrated staging. |
| **R12** | **Partial mitigation:** fewer **401/403** noise events; **DSN** + **environment** + sampling documented. Synthetics still **Open**. |
| **R22** | **Partial mitigation:** clearer retries for section-permissions; banner + refetch unchanged. |
| **R23** | **Partial mitigation:** exports use **`downloadBlob`** / shared helper; public catalog exception **documented**. |

---

## 4. Not done (follow-ups)

1. **Route-level `React.lazy`** for heaviest routes (per post-migration §9 / R6).  
2. **Synthetic checks** for **`/admin/login`** + **`/admin/dashboard`** after SPA cutover.  
3. **Optional:** surface a **subtle** “counts unavailable” hint when nav-counts soft-fail (without error state).  
4. **Matrix / E2E:** role-based navigation and reports AuthZ (R2, R5, R13).  
5. **Product catalog:** admin-private API when backend ready (remove public **`fetch`**).

---

## 5. Verification performed

- **`pnpm --filter @beautonomi/admin-api-client build`**
- **`pnpm typecheck`** in **`apps/admin-web`**

---

## 6. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | Stabilization pass: login next-loop fix, shell soft-fail, **`downloadBlob`**, Sentry tuning, mutation retry default, session loading UX, tracker + risk register updates. |
