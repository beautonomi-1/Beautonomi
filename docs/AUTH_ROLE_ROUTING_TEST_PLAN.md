# Auth & Role Routing — Test Plan

**~30 min checklist.** Use this after any change to auth, role resolution, or portal routing.

---

## 1. Web — Login and /portal (10 min)

| # | Action | Expected |
|---|--------|----------|
| 1 | Log out (if needed). Open `/portal`. | Booking portal landing (no redirect). |
| 2 | Log in as **customer**. Click "Dashboard" in header (or go to `/portal`). | Redirect to `/bookings` (or account-settings if no bookings route). |
| 3 | Log in as **provider_owner** (provider status **active**). Go to `/portal`. | Redirect to `/provider/dashboard`. |
| 4 | Log in as **provider_owner** (provider status **draft** or **pending_approval**). Go to `/portal`. | Redirect to `/provider/get-started`. |
| 5 | Log in as **superadmin**. Go to `/portal`. | Redirect to `/admin/dashboard`. |
| 6 | From login page, complete email login (no `next` param). | Redirect to `/portal`, then server redirects to correct dashboard by role. |

---

## 2. Web — Cross-portal access (5 min)

| # | Action | Expected |
|---|--------|----------|
| 7 | As **customer**, open `/admin/dashboard`. | Redirect away (e.g. `/` or login). No admin UI. |
| 8 | As **customer**, open `/provider/dashboard`. | Redirect away. No provider UI. |
| 9 | As **provider_owner**, open `/admin/*`. | Redirect away (e.g. `/`). No admin UI. |
| 10 | As **superadmin**, open `/provider/dashboard`. | Allowed (superadmin can access). |

---

## 3. Web — Provider status gate (3 min)

| # | Action | Expected |
|---|--------|----------|
| 11 | As **provider_owner** with status **draft** or **pending_approval**, open `/provider/dashboard` directly. | Redirect to `/provider/get-started` (ProviderPortalGate). |
| 12 | As **provider_owner** with status **active**, open `/provider/dashboard`. | Dashboard loads. |

---

## 4. API — GET /api/me/portal (2 min)

| # | Action | Expected |
|---|--------|----------|
| 13 | Unauthenticated: `GET /api/me/portal`. | 401. |
| 14 | Authenticated **customer**: `GET /api/me/portal` (with cookie or Bearer). | `200`, `data.portal === "customer"`, `data.role === "customer"`. |
| 15 | Authenticated **provider_owner** (active): `GET /api/me/portal`. | `200`, `data.portal === "provider"`, `data.provider_id` set. |
| 16 | Authenticated **superadmin**: `GET /api/me/portal`. | `200`, `data.portal === "admin"`. |

---

## 5. Mobile — Wrong-app and portal (7 min)

| # | Action | Expected |
|---|--------|----------|
| 17 | **Customer app**: Log in with a **provider_owner** account. | After launch, show blocked screen: "This account is a Provider. Open the Provider app." (or equivalent). Do not navigate to customer tabs. |
| 18 | **Provider app**: Log in with a **customer**-only account. | After launch, show blocked screen: "This account is for customers. Use the Customer app." (or equivalent). Do not navigate to provider dashboard. |
| 19 | **Customer app**: Log in with **customer** account. | Normal flow to home/tabs. |
| 20 | **Provider app**: Log in with **provider_owner** (active). | Normal flow to dashboard. |
| 21 | **Provider app**: Log in with **provider_owner** (not active). | Onboarding/setup-status flow, not dashboard. |

---

## 6. Session and recovery (3 min)

| # | Action | Expected |
|---|--------|----------|
| 22 | **Mobile**: Log in, kill app, reopen. | Session restored; no forced re-login. |
| 23 | **Mobile**: Simulate 401 on a request (e.g. expired token). | API client refreshes session and retries once; if still 401, signs out. App redirects to login when session is null. |

---

## Notes

- **Source of truth:** `public.users.role` and (for providers) `providers.status`. JWT is not the source for role.
- **Enforcement:** RLS in Supabase is final. Web uses layout RoleGuard + /portal + ProviderPortalGate; API uses `requireRoleInApi` / `requireAuthInApi`.
- Run automated tests: `pnpm run test` (web) and any existing auth/portal tests.
