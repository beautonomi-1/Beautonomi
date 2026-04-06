# Wave 1 pattern-set report (admin SPA)

**Date:** 2026-04-07  
**Intent:** Execute a **small, pattern-setting** slice of Wave 1 (not the full rows 7–18 inventory) so later pages reuse the same list/detail/mutation/filter building blocks.

**References:** [`ADMIN_SPA_WAVE_TRACKER.md`](./ADMIN_SPA_WAVE_TRACKER.md), [`ADMIN_API_PARITY_MATRIX.md`](./ADMIN_API_PARITY_MATRIX.md), [`ADMIN_SPA_UI_CONVENTIONS.md`](./ADMIN_SPA_UI_CONVENTIONS.md), [`ADMIN_SPA_TEST_STRATEGY.md`](./ADMIN_SPA_TEST_STRATEGY.md).

---

## 1. Pages migrated (pattern coverage)

| Pattern | Legacy path | Matrix §4 | Section / gate | Notes |
|---------|-------------|-----------|----------------|-------|
| **Search / filter / server pagination** | `/admin/support-tickets` | 7 | `ADMIN_SECTION_SUPPORT` | Filters persisted in **URL** (`useSearchParams`): `status`, `priority`, `category`, `assign`, `page`, `q` (debounced). Row **View** still opens **legacy** detail (row 8 not in this slice). |
| **Heavy list + bulk + export** | `/admin/bookings` | 13 | `ADMIN_SECTION_PROVIDERS_OPERATIONS` | `GET` list + tabs + client booking-number filter + `POST /api/admin/bookings/bulk` + **CSV** via `fetch` + blob (`/api/admin/export/bookings`). |
| **Detail + mutations** | `/admin/bookings/[id]` | 14 | `ADMIN_SECTION_PROVIDERS_OPERATIONS` | `GET` / `PATCH` / `POST …/cancel` / `POST …/refund` via `postJson` / `patchJson`. Customer/provider profile links → **legacy** until users/providers migrate. |
| **Moderation / operations** | `/admin/disputes` | 16 | `ADMIN_SECTION_PROVIDERS_OPERATIONS` | `GET` list + client-side search + **resolve** modal → `PATCH /api/admin/disputes/:id`. |
| **CRUD-style form (modal)** | `/admin/providers/distance-settings` | 11 | `ADMIN_SECTION_PROVIDERS_OPERATIONS` | Table from `GET /api/admin/providers` + modal → `PATCH …/providers/:id/distance-settings`. **Not** in `AdminShell` nav (same as legacy); reach via direct `/admin/providers/distance-settings`. |

**RBAC:** All five pages use `useAdminSession().canAccess(...)` aligned with **`requireAdminSection` on the APIs**. Several legacy Next pages used **`RoleGuard` with `superadmin` only** for bookings/disputes/distance while the API already allowed **`admin_support`** via `ADMIN_SECTION_PROVIDERS_OPERATIONS`. The SPA follows the **API/matrix** model; product should confirm that is intended (see gaps below).

---

## 2. Reusable patterns proven

| Pattern | Where it lives | Reuse for later W1/W2 pages |
|---------|----------------|------------------------------|
| **TanStack Query** list + `enabled: canAccess(section)` | All five routes | Same for providers, staff, refunds, etc. |
| **`postJson` / `patchJson`** | `@beautonomi/admin-api-client` | Mutations without duplicating `fetch` envelope parsing |
| **`AdminDataTable` + scroll shell** | `components/admin/AdminDataTable.tsx` | Dense tables (reviews, refunds, staff) |
| **URL-driven filters** | `SupportTicketsPage` | Reports, user lists, any shareable admin view |
| **Query string builder + unit test** | `buildSupportTicketsSearchParams.ts` | Copy/adapt per resource (`limit`/`offset` APIs) |
| **Support ticket category labels** | `supportTicketCategories.ts` (mirrors web lib) | Keep in sync when categories change |
| **403 vs generic error** | `AdminApiError` + `PermissionDenied` | Standard across pages |
| **Deep links** | SPA `Link` + `adminSpaTo` / detail routes | No separate admin origin env |

---

## 3. Gaps exposed in the foundation

| Gap | Impact | Suggested next step |
|-----|--------|---------------------|
| **No shared toast system** | Mutations use minimal inline errors only | Add Sonner or a thin `useAdminToast` wrapper for parity with Next admin |
| **Skeletons vs pulse blocks** | Conventions §8 prefer layout skeletons; pages use simple pulse | Introduce 2–3 skeleton primitives (table, detail header, form) |
| **Bundle size** | Vite warns ~610 kB single chunk | Lazy `React.lazy` per Wave 1+ route group |
| **Global search → SPA detail** | `adminSearchResultSpaPath` targets detail routes | Extend if list views need `?highlight=` again |
| **`GET` vs envelope quirks** | Support tickets JSON is **not** `{ data: … }`; others use `successResponse` | Document per route in matrix §5; optional Zod in `admin-api-client` |
| **Legacy vs API RBAC mismatch** | `admin_support` may see SPA bookings/disputes but Next pages blocked them | PM/security: align Next `RoleGuard` or accept SPA as source of truth for those paths |

---

## 4. Blockers for broader Wave 1 execution

| Severity | Blocker |
|----------|---------|
| **Process** | Checklist §0 (W0 verification / matrix **Reviewed** / smoke) still governs **formal** W1 exit — this PR is an **engineering pattern slice**. |
| **Product** | Confirm **RBAC** intent for bookings/disputes vs old Next `superadmin`-only UI. |
| **Remaining routes** | Rows **8, 9, 10, 12, 15, 17, 18** still placeholders; support ticket **detail** is the highest coupling to row 7. |
| **Tests** | Test strategy §2.x (Playwright smoke, MSW integration) **not** added here — only Vitest for query builder + existing libs. |

---

## 5. Recommended changes before scaling to more pages

1. **Route-level code splitting** for `admin-web` (lazy routes).  
2. **One shared mutation helper** (invalidate keys + toast + `AdminApiError` mapping).  
3. **Contract tests** (Zod or fixtures) for `GET /api/admin/support-tickets`, `GET /api/admin/disputes`, `GET /api/admin/bookings` list payload — matrix §6.  
4. **Migrate support-tickets/[id]** next so row 7 is not split across stacks.  
5. **Align Next `RoleGuard`** on bookings/disputes/distance with API roles **or** document intentional superadmin-only UX in the matrix.

---

## 6. Verification run

- `pnpm exec turbo run typecheck test build --filter=admin-web`  
- `pnpm exec turbo run typecheck test build --filter=@beautonomi/admin-api-client`  

---

## 7. Document control

| Date | Change |
|------|--------|
| 2026-04-07 | Initial pattern-set delivery + doc. |
