# Legacy embedded admin — decommission inspection report

**Date:** 2026-04-07  
**Scope:** `apps/web` Next.js admin surface vs Vite SPA (`apps/admin-web`) + shared APIs.  
**Related:** [`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md), [`ADMIN_CUTOVER_EXECUTION_REPORT.md`](./ADMIN_CUTOVER_EXECUTION_REPORT.md), [`ADMIN_SPA_RISK_REGISTER.md`](./ADMIN_SPA_RISK_REGISTER.md).

---

## 1. Inspection summary

| Area | Location | Role today |
|------|----------|------------|
| **Legacy routes** | `apps/web/src/app/admin/**` (~96 `page.tsx` + nested components, `layout.tsx`, `loading.tsx`, `error.tsx`) | Served when **`ADMIN_SPA_ROUTING`** is unset or **`legacy`**; bypassed for HTML navigations when **`spa`**. |
| **Legacy chrome** | `apps/web/src/components/admin/*` | **AdminShell**, shared list chrome (**AdminPageHeader**, **AdminFilterBar**, **BulkActionsBar**), **NotificationsDropdown**, **ExploreModerationTable**, **WysiwygEditor** — imported almost exclusively from **`app/admin/**`**. |
| **Layout + guard** | `apps/web/src/app/admin/layout.tsx` | **RoleGuard** + **AdminShell** for all `/admin/*` except `/admin/login`. |
| **Edge guard** | `apps/web/src/proxy.ts` | **`legacy` mode:** session + **ALL_ADMIN_ROLES** for `/admin/*` (except SPA asset bypass / rewrite rules). **`spa` mode:** HTML rewrites skip legacy layout. |
| **APIs** | `apps/web/src/app/api/admin/**` | **Must remain** — SPA and legacy both call these routes. |
| **RBAC constants** | `apps/web/src/lib/admin-sections.ts` | Re-export of **`@beautonomi/admin-access`** — **must remain** for API + any server code. |
| **HTTP client** | `apps/web/src/lib/http/fetcher.ts` (`isScopedAdminCustomizationUrl`, etc.) | Used heavily by **legacy pages**; also patterns mirrored in **`@beautonomi/admin-api-client`** for SPA. **Keep** until legacy tree deleted or unused. |
| **Global shell** | `apps/web/src/app/ClientAppShell.tsx` | **ImpersonationBanner** (moved out of `components/admin` in this pass) — **not** legacy-admin-only. |
| **Redirects** | `next.config.mjs` | No `/admin` redirects beyond global rules; **admin cache headers** added for SPA static assets + shell. |
| **“Feature flags”** | No dedicated **`ADMIN_SPA_*`** product flags in `apps/web` beyond **`ADMIN_SPA_ROUTING`** env (deploy). | |

---

## 2. What can be deleted **now**

**Recommendation: do *not* delete `app/admin/**` or legacy-only components yet** if Tier-B rollback to **`legacy`** must remain a one-redeploy switch without restoring an old git SHA.

**Safe removals completed in this pass:**

| Item | Rationale |
|------|-----------|
| **`components/admin/ImpersonationBanner.tsx`** | Not part of embedded admin UI; used only from **`ClientAppShell`**. **Moved** to **`components/auth/ImpersonationBanner.tsx`** to avoid implying it is legacy-only. |

**Could delete after explicit EM decision (not done here):**

- None of the **`app/admin/**`** tree without breaking **`ADMIN_SPA_ROUTING=legacy`**.

---

## 3. What must remain **temporarily** (rollback + parity)

| Item | Why |
|------|-----|
| **Entire `apps/web/src/app/admin/**`** | **`legacy`** mode serves these pages; rollback matrix row “legacy still in artifact” depends on them. |
| **`components/admin/*` (remaining 7 files)** | Imported by legacy pages only (except moved banner). |
| **`proxy.ts` legacy admin branch** | Enforces edge auth for `/admin/*` when not in **`spa`** rewrite path. |
| **`app/api/admin/**`** | Shared backend for SPA + any remaining tooling. |
| **`lib/admin-sections.ts`**, **`lib/http/fetcher.ts`** admin scope helpers | Legacy pages + server parity; SPA uses package client for browser calls. |
| **Legacy `/admin/login` Next page** | Login for **`legacy`** admin UX (distinct from SPA login at same path when **`spa`** — routing decides which shell loads). |

---

## 4. Rollback-sensitive code **intentionally kept**

- **`ADMIN_SPA_ROUTING`** handling in **`proxy.ts`** (rewrite vs legacy path).
- **`scripts/sync-admin-spa.mjs`** + **`public/admin/`** gitignore — SPA artifact path.
- **Next `app/admin/**`** as full fallback UI.

---

## 5. Transitional code — **mark and remove later**

| Location | Marker | Remove when |
|----------|--------|-------------|
| `app/admin/layout.tsx` | File header comment (`ADMIN_LEGACY_DECOMMISSION_REPORT`) | After **≥2 weeks** stable SPA-only production + signed milestone ([`ADMIN_SPA_CUTOVER_PLAN.md`](./ADMIN_SPA_CUTOVER_PLAN.md) §8). |
| `components/admin/AdminShell.tsx` | File header comment | Same; last consumer is legacy layout. |
| `components/admin/*` (other files) | Treat as **legacy-only**; no extra marker per file | When **`app/admin/**` deleted**, delete folder if grep shows no imports. |
| Duplicate UX primitives (**AdminPageHeader** in Next vs SPA) | Product/FE may consolidate later | Optional; not blocking. |

---

## 6. Follow-up cleanup items (ordered)

1. **Production policy:** Drop **`legacy`** support — remove **`ADMIN_SPA_ROUTING`** and **`proxy.ts`** branches; always serve SPA for `/admin` HTML.  
2. **Delete `apps/web/src/app/admin/**`** (entire tree) + **`components/admin/**`** after grep confirms no imports.  
3. **Prune `fetcher`**: Remove admin-only call sites if no remaining importers; keep scope injection if any server route still needs it.  
4. **Build weight:** Measure Next build time / trace after tree deletion.  
5. **Docs:** Remove references to “embedded admin” in internal runbooks; point to SPA-only.  
6. **Impersonation / deep links:** Ensure SPA user-detail flows cover anything that only existed on legacy pages.

---

## 7. Risks if legacy code stays **too long**

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Dual UI drift** | Product bugs when docs or support reference wrong UI. | Single source of truth in **wave tracker** + comms; shorten rollback window once confident. |
| **Security patch surface** | Two shells + duplicate forms to audit. | Prioritize deletion after sign-off; critical fixes may need double application until then. |
| **Bundle / compile cost** | Legacy pages still compiled into Next app even when **`spa`** is default for users (depending on tree-shaking / RSC graph). | Delete **`app/admin/**`** after rollback moratorium. |
| **Contributor confusion** | Engineers edit legacy page by mistake. | Header comments + this report linked from **wave tracker**. |

---

## 8. Removed vs retained (this change set)

| Removed / relocated | Retained |
|---------------------|----------|
| **`ImpersonationBanner`** removed from `components/admin/` and **relocated** to `components/auth/` (same component, clearer ownership). | All of `app/admin/**`, remaining `components/admin/*`, `proxy.ts` legacy branch, all `api/admin/*` |

| Added / updated |
|-----------------|
| `apps/web/src/components/auth/ImpersonationBanner.tsx` |
| `ClientAppShell.tsx` import path |
| Transitional comments on `app/admin/layout.tsx`, `components/admin/AdminShell.tsx` |
| **`ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`** — implementation delta row linking this report |

---

## 9. Doc / tracker updates

- **`ADMIN_SPA_WAVE_TRACKER.md`** — legacy decommission **phase** note (rollback vs delete).  
- **`ADMIN_SPA_RISK_REGISTER.md`** — **R24** long-lived dual-stack risk.  
- **`ADMIN_CUTOVER_EXECUTION_REPORT.md`** — related link to this report.  
- **`ADMIN_SPA_DEPLOYMENT_AND_VERCEL_MODEL.md`** — delta row for legacy retention vs SPA.  
- This file — canonical inventory for decommissioning.

---

## 10. Changelog

| Date | Change |
|------|--------|
| 2026-04-07 | Initial inspection; moved **ImpersonationBanner** to `components/auth`; marked legacy layout/shell. |
