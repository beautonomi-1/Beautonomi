# Admin SPA — performance optimization report

**Date:** 2026-04-05  
**Scope:** `apps/admin-web` (Vite 6, React 19, TanStack Query 5).  
**Goal:** Improve initial load, navigation cost, and interaction smoothness **without** changing product behavior (same routes, same APIs, same visible outcomes).

---

## 1. Bottlenecks found

| Area | Bottleneck | Class | Evidence / rationale |
|------|------------|-------|----------------------|
| **Entry bundle** | `App.tsx` **statically imported** ~70 route modules → one large JS graph parsed on first load | **Bundle** | Post-migration review (R6); Vite build showed a **~512 kB** minified `index` chunk before router split. |
| **Vendor graph** | `react-dom`, `react-router`, `@tanstack/react-query`, `lucide-react` all rolled into the same entry | **Bundle** | Default Rollup grouping kept framework weight in the main chunk. |
| **Route transition** | First visit to each admin page paid **parse cost** even if user never opened that screen | **Bundle** | Eager imports. |
| **Client-side search** | **Bookings** + **Disputes** filtered full in-memory lists on **every keystroke** | **Render** | `useMemo` keyed on `searchQuery` → full table reconcile per keypress on large lists. |
| **Back navigation** | Default **gcTime** (5 min in v5) could drop list cache when users navigated away longer | **Query** | Repeated fetches when returning to heavy lists. |
| **Shell** | Lazy route components suspended **without** a local boundary → risk of blank main until chunk load | **UX** | No `Suspense` around `Outlet` before this pass. |
| **Charts / maps** | **Gods Eye**, **Analytics**, **Mapbox**, **Service zones** SPA pages are **JSON/read-only** today — no `recharts` / `mapbox-gl` in bundle | **Bundle** | No heavy viz library to isolate yet; future chart/map work should **dynamic-import** inside those routes. |

---

## 2. Fixes applied

### 2.1 Route-level code splitting (**bundle**)

- Added [`apps/admin-web/src/lazyAdminPages.tsx`](../../apps/admin-web/src/lazyAdminPages.tsx): **`React.lazy`** + dynamic `import()` for **all** authenticated route modules.
- [`App.tsx`](../../apps/admin-web/src/App.tsx) now imports **`@/lazyAdminPages`** as namespace **`P`** and renders **`<P.DashboardPage />`**, etc.
- **Eager (unchanged):** **`LoginPage`**, **`AdminChrome`**, **`PermissionDenied`**, **`RequireAuth`** — fast auth path and shell chrome without waiting on route graph.

**Estimated impact:** Initial parse/execute of **admin route code** moves to **on-demand** chunks (dozens of **~1–12 kB** gzip route chunks in build output). First paint after login still loads **dashboard** chunk first navigation.

### 2.2 `Suspense` boundary in shell (**UX**)

- [`AdminChrome.tsx`](../../apps/admin-web/src/components/layout/AdminChrome.tsx): **`Suspense`** around **`<Outlet />`** with **`AdminPageSkeleton`** (8 rows) and **`aria-busy`**.

**Estimated impact:** Predictable loading chrome during chunk fetch; avoids empty main region flash.

### 2.3 Rollup `manualChunks` (**bundle**)

- [`vite.config.ts`](../../apps/admin-web/vite.config.ts): separate async chunks for **`lucide-react`**, **`@tanstack/react-query`**, **`react-dom`**, **`react-router`**.

**Measured impact (production build, Windows, 2026-04-05):**

| Asset (minified) | Before (approx.) | After |
|------------------|------------------|--------|
| Main `index-*.js` | **~512 kB** (gzip ~150 kB) | **~291 kB** (gzip ~79 kB) |
| `react-dom-*.js` | (in index) | **~186 kB** (gzip ~58 kB) |
| `react-router-*.js` | (in index) | **~42 kB** (gzip ~15 kB) |
| `tanstack-query-*.js` | (in index) | **~42 kB** (gzip ~13 kB) |
| `lucide-*.js` | (in index) | **~23 kB** (gzip ~5 kB) |

*“Before” main size taken from Vite warning line immediately prior to adding `react-dom` / `react-router` splits; after split the **>500 kB chunk warning cleared**.*

### 2.4 Query cache **`gcTime`** (**query**)

- [`queryClient.ts`](../../apps/admin-web/src/lib/queryClient.ts): default **`gcTime: 15 * 60_000`** for queries (inactive data retained longer).
- [`AdminSessionProvider.tsx`](../../apps/admin-web/src/providers/AdminSessionProvider.tsx): **`gcTime: 30 * 60_000`** for **bootstrap** and **section-permissions** (long-lived session data).

**Estimated impact:** Returning to a list/detail within the window reuses cache if **`staleTime`** not exceeded → fewer network round-trips; slightly higher memory use (acceptable for admin desktop use).

### 2.5 Deferred client search (**render**)

- [`DisputesPage.tsx`](../../apps/admin-web/src/routes/DisputesPage.tsx), [`BookingsPage.tsx`](../../apps/admin-web/src/routes/bookings/BookingsPage.tsx): **`useDeferredValue`** on the search string feeding **`useMemo`** filters.

**Estimated impact:** Typing stays responsive; heavy list reconciliation can **lag one frame** behind input (React concurrent behavior). **Same** filtered results once stable — no API or sort change.

---

## 3. Not changed (intentionally)

| Topic | Reason |
|--------|--------|
| **Server pagination** for bookings/disputes | Product contract; would change payload and UX. |
| **Virtualized tables** | Larger refactor; revisit if row counts consistently **>500** with perf issues. |
| **`refetchOnWindowFocus`** for bootstrap | Keeps session freshness; **`staleTime`** already limits churn. |
| **Duplicate shell queries** | **nav-counts**, **activity**, **tenants** serve different UI; no redundant merge identified. |
| **URL-debounced search** (e.g. users list) | Already uses **`useDebouncedUrlParam`**. |

---

## 4. Remaining hotspots

| Hotspot | Class | Suggested follow-up |
|---------|-------|---------------------|
| Main **`index-*.js`** (~291 kB) | Bundle | Audit **`@beautonomi/*`** workspace packages inlined; consider lazy **Sentry** only when DSN set (already dynamic in `main.tsx`). |
| **Lucide** imports | Bundle | **Tree-shaking** is per-icon; new `lucide-react` bulk imports in one file can bloat **`lucide`** chunk — prefer named icon imports (existing pattern). |
| **Heavy pages** (payouts, bookings detail, support tickets) | Bundle + render | Optional **nested** `lazy()` for modals/tabs only if measured jank. |
| **Future maps/charts** | Bundle | **`import()`** map/chart libraries **inside** the page component that needs them. |
| **E2E perf** | Network | Lighthouse / Web Vitals on **staging** with **`ADMIN_SPA_ROUTING=spa`**. |

---

## 5. Guardrails (regression prevention)

1. **New routes:** Add a **`lazy()`** entry in **`lazyAdminPages.tsx`** and a **`<P.YourPage />`** line in **`App.tsx`** — do **not** import page components directly from **`App.tsx`** except **login** / auth-only pieces.  
2. **Vite `manualChunks`:** If you add **`manualChunks`** for **`react`**, keep **`react` + `react-dom`** compatible (test production build). Current split uses **`react-dom`** and **`react-router`** only.  
3. **Query defaults:** Overly large **`gcTime`** increases memory — if memory is constrained on low-end devices, lower default or override per infinite list.  
4. **`useDeferredValue`:** Use for **client-only** filters; do **not** defer URL-driven server search (would desync address bar).  
5. **CI:** Keep **`pnpm build`** for **`admin-web`** green; optional: fail build if **`index-*.js`** gzip exceeds a budget (not implemented).  

---

## 6. How to re-measure

```bash
cd apps/admin-web
pnpm build
```

Inspect **`dist/assets/`** sizes and gzip lines. For local runtime: Chrome Performance panel, **Disable cache** off, navigate between dashboard → bookings → users.

---

## 7. Changelog

| Date | Change |
|------|--------|
| 2026-04-05 | Lazy routes, Suspense shell, manualChunks, gcTime, useDeferredValue on bookings/disputes; this report. |
