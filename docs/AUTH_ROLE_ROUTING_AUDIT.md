# Auth & Role Routing Audit

**Date:** 2025-03  
**Scope:** Web (Next.js 16 App Router), Customer Expo app, Provider Expo app.  
**Source of truth for role:** `public.users.role`. Provider linkage: `providers.user_id` (owner) or `provider_staff` (staff). Provider status: `providers.status` (`draft` | `pending_approval` | `active` | `suspended`).

---

## 1. Web auth/routing summary

### 1.1 Middleware

- **No root `middleware.ts`** in `apps/web`. There is no Next.js edge middleware enforcing auth or role at request level.
- **`apps/web/src/middleware/portal-auth.ts`** – Portal token validation for passwordless booking portal; not used for admin/provider/customer routing.
- **Gap:** All protection is layout/component and API; no server-side redirect before page load for `/admin/*` or `/provider/*`.

### 1.2 Role retrieval

| Layer | Where | How role is obtained |
|-------|--------|------------------------|
| Server (API) | `lib/auth/requireRole.ts` | `getSupabaseServer()` → `auth.getUser()` → `users` table `.select('id, role, full_name')` |
| Server (API) | `lib/supabase/api-helpers.ts` | `requireRoleInApi(roles, request)` – uses `requireRole()` above; supports Bearer for mobile |
| Client | `providers/AuthProvider.tsx` | Session from Supabase client; then `users` via Supabase `.select('id, role, ...')` or sessionStorage cache |
| Client | `components/auth/RoleGuard.tsx` | `useAuth()` → `role`; redirects if `!allowedRoles.includes(role)` |

Role is always read from **DB (`users.role`)**, not JWT claims. AuthProvider caches role in localStorage/sessionStorage.

### 1.3 Route groups and enforcement

| Route / group | Allowed roles | Enforcement | Redirect / behavior | Gaps |
|---------------|----------------|-------------|----------------------|-----|
| `/admin/*` | superadmin | Admin layout: `RoleGuard` allowedRoles=`["superadmin"]`, redirectTo=`"/"` | Unauthorized → `/` | No middleware; client guard only. Customer/provider can hit layout before redirect. |
| `/provider/*` | provider_owner, provider_staff | Provider layout: `RoleGuard` allowedRoles=`["provider_owner","provider_staff"]`; onboarding & embed allowed without guard | Unauthorized → `/provider/dashboard` or `/` | No provider_status check: non-active providers can reach dashboard. No middleware. |
| `/account-settings/*` | customer + (provider as customer) | No RoleGuard in layout; pages/APIs assume authenticated user | — | Accessible by any logged-in user; APIs scope by user id. |
| `/booking`, `/book/*`, `/checkout` | public + customer | Public or requireAuth in flows | — | OK. |
| `/profile` | authenticated | — | — | OK. |
| `/login` | — | Redirect after login via `redirectByRole()`: superadmin→`/admin/dashboard`, provider→`/provider/dashboard`, else `"/"` | Good. | Does not consider provider status (e.g. draft → onboarding). |
| `/` (public) | public | — | — | "Dashboard" / nav links may point to fixed URLs; no single `/portal` entry. |

### 1.4 Redirect targets today

- **Admin:** RoleGuard redirectTo default `"/"` (overridden in layout not set, so `"/"`).
- **Provider:** RoleGuard defaultRedirect = pathname.startsWith("/provider") ? `/provider/dashboard` : `/`.
- **Login after sign-in:** `redirectByRole()` → admin dashboard, provider dashboard, or `/`.

### 1.5 Dashboard / portal entrypoints

- Login: `redirectByRole()` already role-based.
- No single `/portal` route; headers/nav likely link to `/provider/dashboard`, `/admin/dashboard`, `/account-settings` directly. If user bookmarks wrong portal, they rely on RoleGuard to redirect.

---

## 2. Mobile auth/routing summary

### 2.1 Customer app (`apps/customer`)

| Item | Implementation | Gap |
|------|----------------|------|
| Auth | `AuthProvider` – Supabase session, no role in context | Role not exposed; no "wrong app" check. |
| Index | If session → redirect to `/(app)/(tabs)/home` | Customer who is actually provider_owner can enter customer app. |
| Config | `ConfigBundleProvider` – `GET /api/public/config-bundle?platform=customer` | Public; OK. |
| Role from API | Not used on launch | No call to `/api/me/role` or portal endpoint. |

**Gap:** No check that the user is a customer; provider/superadmin can use customer app without being blocked.

### 2.2 Provider app (`apps/provider`)

| Item | Implementation | Gap |
|------|----------------|------|
| Auth | `AuthProvider` – session only | No role in context. |
| Index | If session → `GET /api/provider/profile`; if 404/no profile → onboarding, else dashboard | Uses profile existence, not `users.role`. Customer with no provider profile gets onboarding. No explicit "this account is customer, use customer app" block. |
| Role | `/api/me/role` with `X-App: provider` upgrades customer→provider_owner if they own a provider | Role used in API; app doesn’t call `/api/me/portal` to block wrong-app. |

**Gap:** No portal check; no "wrong app" screen if a customer opens provider app.

### 2.3 Session persistence and recovery

- Customer: Supabase client; session in memory + Supabase persistence.
- Provider: Same; `getAccessToken` uses `getUser()` then `getSession()` so token is validated before requests.
- **Session recovery (implemented):** Both apps wrap the API client with `withSessionRecovery`: on 401, call `supabase.auth.refreshSession()`, retry the request once; if still 401, call `signOut()`. App then redirects to login when session is null.

### 2.4 Realtime and polling hygiene

- **Realtime:** Supabase `.subscribe()` used in customer (e.g. bookings, chat) and provider (messaging, dashboard). Ensure subscriptions are created only when session exists and cleaned up in `useEffect` return (unsubscribe on unmount).
- **Polling:** Customer on-demand waiting uses `setInterval(load, 12000)` (≥10s). Provider time-clock uses 30s. Prefer realtime where already used; use polling as fallback with interval ≥10s, foreground only, and clear interval on unmount to avoid duplicates.

---

## 3. Config and feature flags

| Source | Used by | Auth | Safe for public |
|--------|--------|------|------------------|
| `GET /api/public/config-bundle` | Customer app, provider app (ConfigBundleProvider) | No | Yes |
| Feature flags | Server: `lib/server/feature-flags.ts`; provider: `lib/provider-portal/feature-flags.ts`; admin API | Varies | Flags evaluated per request/role; no secrets in client bundle. |

---

## 4. Audit table (route → role → enforcement → redirect → gaps)

| Route | Roles allowed | Enforcement layer | Redirect target | Gaps |
|-------|----------------|--------------------|------------------|------|
| `/admin/*` | superadmin | Layout RoleGuard | `/` | No middleware; no provider_status. |
| `/provider/*` | provider_owner, provider_staff | Layout RoleGuard | `/provider/dashboard` or `/` | No provider status→onboarding redirect; no middleware. |
| `/provider/onboarding` | any (allowed by layout) | — | — | OK. |
| `/account-settings/*` | any authenticated | Per-page/API | — | OK. |
| `/login` | — | redirectByRole after login | admin / provider / `/` | Does not send provider to onboarding when status !== active. |
| `/` (public) | public | — | — | Single "Dashboard" link should go to `/portal` once implemented. |
| Customer app (index) | — | session → home | — | No portal check; provider can enter. |
| Provider app (index) | — | session + profile → onboarding or dashboard | — | No portal check; customer can see onboarding. |

---

## 5. Recommendations (implemented in phases)

1. **Single source of truth helpers (web):** `lib/auth/role.ts` with `getUserRoleServer()`, `getPortalForUser()`, `getDefaultRouteForPortal()`.
2. **GET /api/me/portal:** Auth required; returns `role`, `portal`, `provider_id`, `provider_status`; used by web and mobile.
3. **/portal page (web):** Server-side session + role; redirect to admin dashboard, provider dashboard, provider onboarding/setup-status, or customer (e.g. `/bookings`/`/account-settings`).
4. **Middleware (optional):** Add `middleware.ts` to protect `/admin/*` and `/provider/*` with redirects to avoid flash; keep layout guards as backup.
5. **Replace hardcoded dashboard links** with `/portal` where appropriate.
6. **Mobile:** On launch, call `GET /api/me/portal`; if portal doesn’t match app, show "wrong app" screen with CTA to correct app or web admin.
7. **Provider status:** In `getPortalForUser()`, map provider status to `provider_onboarding` or suspended; /portal and provider layout redirect non-active to onboarding/setup-status or suspended screen.
8. **Session recovery:** Mobile: on 401, refresh session and retry once; then sign out and go to login.
9. **Realtime/polling:** Ensure subscriptions unmount and polling interval ≥ 10s; no tight loops.

---

## 6. Verification checklist (see AUTH_ROLE_ROUTING_TEST_PLAN.md)

- Login as customer / provider_owner / provider_staff / superadmin; hit `/portal`; expect correct dashboard.
- Cross-portal: provider visits `/admin/*` → redirect; customer visits `/provider/*` → redirect.
- Provider not active → /provider/onboarding or setup-status.
- Mobile: provider in customer app → blocked screen; customer in provider app → blocked screen.
- Session persistence and 401 recovery on mobile.
