# Admin foundation hardening report

**Date:** 2026-04-05  
**Scope:** `apps/admin-web` only — no new product features; align patterns exposed by Wave 1 for safer waves 2–5.

---

## 1. Problems observed (Wave 1)

| Area | Issue |
|------|--------|
| **Queries** | Ad hoc `queryKey: ["admin", …]` strings; risk of typo drift and wrong invalidation scope |
| **RBAC** | Repeated `canAccess` + `<PermissionDenied />` boilerplate per page |
| **Loading / error** | Mix of inline pulse divs, raw error text, and partial 403 handling |
| **Modals** | Duplicated fixed overlay + panel markup; inconsistent a11y labelling |
| **Mutations** | Inline red text for errors; easy to miss in modals |
| **Tables / filters** | Filter UI duplicated; URL sync patterns not shared (addressed where W1 already used search params) |
| **Types** | API envelopes documented in `adminClient`; page-level types remain local until OpenAPI/Zod share layer exists |
| **Shell** | `AdminChrome` and `LoginPage` used raw `["admin"]` / `["admin", "nav-counts"]` keys |

---

## 2. Changes made

### 2.1 Query conventions

- **`lib/adminQueryKeys.ts`** — single factory tree; all keys prefixed with `["admin", …]`.
- **Invalidation:** Prefer `adminQueryKeys.<domain>.all()` + specific detail keys; after login use `adminQueryKeys.root`.
- **`lib/queryClient.ts`** — retries skip `AdminApiError` 401/403 via `isAdminApiForbidden` / unauthorized helpers (no message-regex hacks).

### 2.2 RBAC hooks

- **`useAdminSectionPage(section, message?)`** — returns `{ allowed, denied }`; `denied` is a ready-to-render node. Implemented in **`.tsx`** because the denied node is JSX.
- **`useSuperadminPage(message?)`** — same for superadmin-only routes (also `.tsx`).

### 2.3 UI primitives (`components/admin/`)

- **`AdminPageSkeleton`**, **`AdminRetryBlock`**, **`AdminQueryBlock`** — list/detail/dashboard async consistency.
- **`AdminModal`** — one overlay/dialog pattern; `labelledBy` for `aria-labelledby`.
- **`AdminMutationAlert`** — first non-null error from a list (forms + modals).

### 2.4 Small utilities

- **`lib/adminApiError.ts`** — `isAdminApiAuthFailure` (401/403) for full-page deny UX.
- **`lib/adminUi.ts`** — `adminTabButtonClass` for segmented filters/tabs.
- **`hooks/useDebouncedUrlParam`** — debounced draft → URL param (e.g. support ticket `q`).

### 2.5 Pages / shell updated

- **Bookings:** list + **detail** use `adminQueryKeys.bookings.*`, section hook, `AdminModal` + `AdminMutationAlert` for cancel/refund/save.
- **Provider distance settings:** same keys namespace (`providers.distanceList`), section hook, `AdminModal`, skeleton/retry.
- **`AdminChrome`:** `navCounts`, `tenants`, `activity` use `adminQueryKeys`.
- **`LoginPage`:** invalidates `adminQueryKeys.root`.

### 2.6 Tests

- **`src/lib/adminQueryKeys.test.ts`** — guards key shape and filter serialization for cache correctness.

---

## 3. Intentional non-goals (this pass)

- No new API routes or admin sections.
- No global OpenAPI client or shared DTO package (future leverage).
- Drawer/mobile filter `Sheet` — convention documented in UI doc; not forced on every W1 page.
- E2E expansion — still per `ADMIN_SPA_TEST_STRATEGY.md` wave exits.

---

## 4. Guidance for waves 2–5

1. **New query:** add a factory under `adminQueryKeys` and a row in `adminQueryKeys.test.ts` if the key includes dynamic segments or filters.  
2. **New page:** start with `useAdminSectionPage` or `useSuperadminPage`; use `AdminQueryBlock` or skeleton + retry + `isAdminApiAuthFailure`.  
3. **Mutations:** use `AdminModal` + `AdminMutationAlert`; avoid new bespoke overlay divs.  
4. **Invalidation:** target the narrowest key (e.g. detail) plus `*.all()` when lists must refresh.  
5. **Docs:** update `ADMIN_SPA_WAVE_TRACKER.md` when migrating a route; reference §14 in `ADMIN_SPA_UI_CONVENTIONS.md` for patterns.

---

## 5. Residual risk / follow-ups

- **Typing:** response types remain hand-written per page until a generated or Zod-validated layer exists.  
- **403 in mutations:** `AdminMutationAlert` shows message; optional enhancement is mapping `AdminApiError` to permission copy.  
- **Gods Eye / Analytics:** verify map/chart parity vs legacy remains a W0/W1 sign-off item, not covered here.

---

## 6. References

- [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md) §14  
- [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md) §2.7  
- [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md)
