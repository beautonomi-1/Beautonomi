# ADMIN_SPA_UI_CONVENTIONS

**Purpose:** Ensure **~96 pages feel like one product**. All SPA pages must comply unless an explicit **exception** is approved by Design + EM and noted in `ADMIN_SPA_WAVE_TRACKER.md`. After migration, this document is **enforceable** via code review and CI per [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md).

**Owner:** Design lead + FE lead (see governance **§1** for RACI).

---

## 1. Page structure

```
<AdminPageShell>
  <AdminPageHeader title="" description="" breadcrumbs? actions? />
  <AdminPanel>  {/* optional nested panels */}
    …content
  </AdminPanel>
</AdminPageShell>
```

- **Max content width:** `max-w-[1600px] mx-auto px-4 md:px-6` (align with legacy admin feel unless Design updates token).  
- **Vertical rhythm:** `space-y-6` between major blocks.

---

## 2. Page header (`AdminPageHeader`)

- **Title:** `text-2xl font-semibold tracking-tight`  
- **Description:** `text-sm text-muted-foreground` one line preferred  
- **Actions:** right-aligned button group; **primary** action one only  
- **Breadcrumbs:** optional; required for **depth ≥ 2** from section home

---

## 3. Panels

- **Default:** white background, `border rounded-xl shadow-sm p-4 md:p-6`  
- **Dense tables:** reduce padding to `p-3` via variant `dense`

---

## 4. Data tables (`AdminDataTable`)

- **Desktop:** full table; `overflow-x-auto`; optional **sticky first column** for wide rows  
- **Mobile (M1):** **card list** OR horizontal scroll — **pick per page class** in tracker  
- **Header row:** sortable columns show icon; **server sort** must match API query params  
- **Row actions:** `…` menu; destructive actions **never** primary icon-only without confirm

---

## 5. Filters and search

- **Placement:** toolbar row **above** table; `gap-3 flex-wrap`  
- **Persistence:** **URL search params** (`useSearchParams`) for shareable state  
- **Mobile:** filters collapse into **`Sheet` drawer** (“Filters” button)

---

## 6. Detail views

- **Pattern:** **master-detail** on desktop (optional); **separate route** `/[id]` for deep links  
- **Loading:** skeleton for header + 3 rows  
- **404:** dedicated “Not found” with back link

---

## 7. Drawer vs modal

| Use **modal** | Use **drawer** |
|----------------|----------------|
| Confirmations, short forms | Filter panels on mobile, long forms, audit trail side panels |
| Destructive confirm | |

---

## 8. Loading / empty / error

| State | Pattern |
|-------|---------|
| **Loading** | Skeletons matching layout (not generic spinner only) |
| **Empty** | `EmptyState` illustration optional; **action** if user can create |
| **Error** | Inline `Alert` + **Retry**; 403 uses **permission** copy |

---

## 9. Destructive actions

- **Always** confirm modal; name the entity (“Delete payout #123”)  
- **Prefer** `type="button"` and loading state on confirm

---

## 10. Toasts

- **Success:** short; auto-dismiss  
- **Failure:** include **action** (“Retry”) if idempotent

---

## 11. Permission-denied

- Full-page variant: icon + **who to contact** (Ops) for access  
- Inline variant: `Alert` inside panel

---

## 12. Touch targets

- Minimum **44×44px** for icon buttons and nav items

---

## 13. References

- `docs/ADMIN_DESIGN_SYSTEM.md` (if aligned — update SPA tokens to match)  
- shadcn/ui components in monorepo

---

## 14. Shared SPA building blocks (`apps/admin-web`)

Use these instead of one-off copies so waves 2–5 stay consistent.

| Concern | Use |
|---------|-----|
| **TanStack Query keys** | `adminQueryKeys` from `@/lib/adminQueryKeys` — always under `["admin", …]`; invalidate with `adminQueryKeys.root` or the relevant `.all()` factory |
| **Section RBAC (full page)** | `useAdminSectionPage(sectionConstant, deniedMessage?)` → `{ allowed, denied }`; render `denied` when set |
| **Superadmin-only pages** | `useSuperadminPage(deniedMessage?)` |
| **401/403 on a query** | `isAdminApiAuthFailure(error)` → full-page `PermissionDenied` |
| **Retryable query error** | `AdminRetryBlock` |
| **List / detail loading** | `AdminPageSkeleton` |
| **Wrapped async query + children render** | `AdminQueryBlock` (loader / auth / error handled once) |
| **Confirmations & short forms** | `AdminModal` (backdrop click closes) |
| **Mutation errors** | `AdminMutationAlert` with `errors={[mutation.error]}` |
| **Segmented tabs (filters)** | `adminTabButtonClass(active)` from `@/lib/adminUi` |

**URL + debounced search:** `useDebouncedUrlParam` when a text field should sync to `?q=` (or similar) without thrashing the server.

**Performance / routing:** New routes use **`lazyAdminPages.tsx`** + **`App.tsx`** pattern — see [`ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md`](./ADMIN_PERFORMANCE_OPTIMIZATION_REPORT.md).

---

## 15. Governance & review

- **PR checklist:** Reviewers use **§2.2** in [`ADMIN_PLATFORM_GOVERNANCE.md`](./ADMIN_PLATFORM_GOVERNANCE.md) (matrix, tracker, conventions, lazy routes, tests).  
- **Exceptions:** Design + EM approval + **wave tracker** note (existing rule above).  
- **CODEOWNERS:** Optional template [`.github/CODEOWNERS.example`](../../../.github/CODEOWNERS.example).

---

## 16. Approval

- [ ] Design lead  
- [ ] FE lead  

**Date:** ___________

---

## 17. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | §15 governance + performance pointer; renumber approval section |
| 2026-04-05 | §14 shared primitives + query-key convention (post–Wave 1 foundation hardening) |
