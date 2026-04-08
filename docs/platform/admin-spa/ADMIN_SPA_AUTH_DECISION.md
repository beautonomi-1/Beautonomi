# ADMIN_SPA_AUTH_DECISION

**Purpose:** Single **approved** authentication and session model for `apps/admin-web`. Eliminates “we’ll decide later” ambiguity.

**Owner:** Platform / Security (approver); FE lead (implements).

**Status:** `Draft` → `Approved` (requires Security sign-off)

---

## 1. Decision summary (recommended — Beautonomi default)

| Topic | Decision |
|-------|----------|
| **Deployment** | **Same origin** as production web app (same scheme + registrable domain as `apps/web` API). |
| **Session transport** | **HTTP cookies** established by existing Supabase web session (mirror current logged-in `apps/web` behavior). SPA uses `fetch(url, { credentials: "include" })` for all `/api/admin/*` and bootstrap calls. |
| **Bearer tokens** | **Not** the primary path for browser SPA in Phase 1. (Provider mobile app uses Bearer; admin SPA is browser-first.) |
| **CSRF** | Same-origin cookie session with **SameSite=Lax/Strict** (match current Supabase cookie policy). If custom CSRF tokens exist on mutating routes, document here after audit. |
| **Subdomain exception** | Only if mandated: document `Domain`, `Secure`, `SameSite`, and CORS; **out of default plan**. |

---

## 2. Login and logout

| Flow | Behavior |
|------|----------|
| **Unauthenticated user hits `/admin/*`** | Redirect to **`/admin/login`** (SPA route). Login UI uses **Supabase JS** same project as `apps/web`. |
| **Post-login** | Redirect to `next` query param or `/admin/dashboard`. |
| **Logout** | Call `supabase.auth.signOut()` + redirect to `/admin/login`; clear **only** SPA-local caches (TanStack Query). |
| **Session refresh** | Rely on **Supabase auto-refresh** in SPA (init client with identical env to web). |

**Local dev:** Vite dev server proxies **`/api`** (covers `/api/auth/*` sign-in) and **`/auth`** (Next `app/auth/callback`) to `localhost:3000` — see `apps/admin-web/vite.config.ts` and README. Alternatively, log in on `:3000` and run SPA with shared cookies.

---

## 3. Bootstrap (role + permissions)

| Endpoint | **Recommended new route:** `GET /api/admin/bootstrap` |
|----------|--------------------------------------------------------|
| **Auth** | `requireRoleInApi(ALL_ADMIN_ROLES)` |
| **Returns** | `{ user: { id, email, full_name }, role, is_superadmin: boolean }` — minimal; **no PII beyond needed for shell** |
| **Errors** | 401 → SPA login; 403 → “not an admin role” page |

**Section permissions:** `GET /api/admin/settings/section-permissions` — cached in SPA with **staleTime: 5 minutes**; **invalidate** after saving team permissions (mutation `onSuccess`).

---

## 4. Admin customization scope (superadmin)

Legacy `fetcher` injects `scope` + `tenant_id` query params for a fixed list of URLs (see `isScopedAdminCustomizationUrl` in `apps/web/src/lib/http/fetcher.ts`).

**SPA requirement:** Implement the **same rules** in `@beautonomi/admin-api-client` (shared constants for URL prefixes). **No drift** — if web list changes, **one package** updates.

---

## 5. Error handling

| HTTP | SPA behavior |
|------|----------------|
| **401** | Clear auth state; redirect `/admin/login?next=...` |
| **403** | Show **Permission denied** full page or inline banner; **do not** show empty tables that imply “no data” |
| **429** | Toast + exponential backoff (search) |
| **5xx** | Error boundary + retry; **Sentry** capture |

---

## 6. Proxy / middleware (`apps/web/src/proxy.ts`)

| Change | Description |
|--------|-------------|
| **Unauthenticated `/admin`** | Continue redirect to `/admin/login?next=...` |
| **Post-SPA** | Ensure **static assets** under `/admin/assets/*` (or chosen prefix) are **not** blocked by admin auth matcher |
| **API** | `/api/admin/*` unchanged auth semantics |

**Action item:** Add sub-section “SPA cutover diff” with exact matcher changes when implementing.

---

## 6a. Multi-market / multi-origin

- **Login and session are per-origin.** Staff using `https://{market-a}/admin` have a session **scoped to that host** unless Platform implements a deliberate SSO pattern (out of default scope).  
- **Bootstrap and all `/api/admin/*` calls** use the **same origin** as the SPA’s address bar.  
- **Deep links** in email must use the **correct** market host; document in Support runbook.

---

## 6b. Content-Security-Policy (CSP)

- **Staging:** Deploy SPA with **Content-Security-Policy-Report-Only** capturing violations for **30 days** or until clean.  
- **Production:** Enforce CSP compatible with Vite bundle script/style sources; **document** `script-src` / `connect-src` (must include Supabase and API origin).  
- **Exceptions** require Security approval and entry in `ADMIN_SPA_RISK_REGISTER.md`.

---

## 6c. SEO / crawlers

- **`/admin/*`:** `noindex, nofollow` via host `X-Robots-Tag` or `<meta name="robots">` in SPA shell HTML template.  
- Verify in staging with `curl -I` on `/admin`.

---

## 7. Feature-flag alignment (auth-adjacent)

- SPA **must not** assume “always on” — optional **read** of bootstrap flag payload (e.g. `{ spaEnabled: boolean }`) if kill switch must hide routes client-side; **authoritative** routing remains server/edge per `ADMIN_SPA_CUTOVER_PLAN.md`.

---

## 8. Implementation Delta

| Date | Note |
|------|------|
| 2026-04-06 | **`GET /api/admin/bootstrap`** implemented per §3 (`apps/web/src/app/api/admin/bootstrap/route.ts`); **`apps/admin-web`** consumes it via `createAdminApiClient().getBootstrap()` with Zod validation. Section permissions cache (**5m** stale) and same-origin `/api` Vite proxy match §2–§3. |
| 2026-04-06 | **Strict review:** Bootstrap maps **`Authentication required` → HTTP 401** so SPA matches §3 (401 → login; 403 → not admin). **`RequireAuth`** redirects with **`?next=`** full `/admin/...` path. **`@sentry/react`** initializes when `VITE_SENTRY_DSN` is set (before render); ErrorBoundary reports to Sentry. |

---

## 9. Approval block

- [ ] Security reviewed cookie / SameSite / session fixation posture  
- [ ] Platform reviewed same-origin deployment diagram  
- [ ] FE lead reviewed bootstrap payload minimization  
- [ ] CSP Report-Only results reviewed (staging)  
- [ ] `noindex` verified on `/admin`  

**Approved by:** _________________ **Date:** _________
