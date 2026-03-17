# Customer mobile app – API auth (Bearer token)

## Why this matters

The customer **mobile app** sends auth via **`Authorization: Bearer <token>`**. It does **not** send cookies. If an API route uses **cookie-only** auth (e.g. `getSupabaseServer()` with no argument), the server sees no user and can return **401** → the client refreshes, retries, gets 401 again → **signOut()** and the user is logged out when opening loyalty, settings, explore, etc.

## Rule for backend

For **any** route that the customer app calls with the authenticated `api` client:

- Use **`getSupabaseServer(request)`** (not `getSupabaseServer()`), and/or
- Use **`requireRoleInApi(roles, request)`** or **`requireAuthInApi(request)`**

so that when the request includes `Authorization: Bearer <token>`, the server uses that token.  
`getSupabaseServer(request)` in `apps/web/src/lib/supabase/server.ts` reads the Bearer token from the request when present and creates a Supabase client with it.

## Routes updated for mobile (customer app)

### All `/api/me/*` routes

Every route under `apps/web/src/app/api/me/` now uses **`getSupabaseServer(request)`** (and where applicable **`requireRoleInApi(..., request)`**). This fixes:

- Profile, profile-completion, loyalty, loyalty-points, verification, avatar, addresses, cart, bookings, orders, wallet, wishlists, notifications, conversations, messages, payment-methods, gift-cards, tax-info, preferences, privacy-settings, referrals, membership, business-settings, custom-requests, waitlist, returns, reviews, account-status, devices, safety/panic, and all other `/api/me/*` endpoints the customer app calls.

### Other authenticated routes the customer app calls

| Route | Change |
|-------|--------|
| **GET/POST /api/recurring-bookings** | `getSupabaseServer()` → `getSupabaseServer(request)` |
| **PATCH/DELETE /api/recurring-bookings/[id]** | Same |
| **POST/PATCH/DELETE /api/bookings/[id]/review** | Switched to `requireRoleInApi(..., request)` + `getSupabaseServer(request)` (was cookie-only `requireRole`) |
| **POST/DELETE /api/explore/events** | `getSupabaseServer()` → `getSupabaseServer(request)` |
| **GET /api/explore/posts** | `getSupabaseServer()` → `getSupabaseServer(request)` |
| **GET /api/explore/posts/[id]** | `getSupabaseServer()` → `getSupabaseServer(request)` |
| **GET/POST /api/explore/posts/[id]/comments** | `getSupabaseServer()` → `getSupabaseServer(request)` |
| **POST /api/reports** | Already used `requireAuthInApi(request)` and only `getSupabaseAdmin()`; no change. |
| **GET/POST/DELETE /api/explore/saved** | Same; no `getSupabaseServer()` in these handlers. |

## Profile completion (percentage)

- **GET /api/me/profile-completion** now:
  - Treats **email** as verified if `users.email_verified` **or** auth user’s **`email_confirmed_at`** is set.
  - Treats **preferred name** as complete if **`preferred_name` or `full_name`** is set (so updating personal details updates the percentage correctly).

See **docs/CUSTOMER_PROFILE_COMPLETION_AUDIT.md** for the full profile-completion flow.

## Adding new customer-facing API routes

When adding a new route that the **customer mobile app** will call with the authenticated `api` client:

1. Accept **`request: NextRequest`** (or `Request`) in the handler.
2. Use **`requireRoleInApi(roles, request)`** or **`requireAuthInApi(request)`** for auth.
3. Use **`getSupabaseServer(request)`** (not `getSupabaseServer()`) when you need a Supabase client that represents the current user.

This keeps mobile (Bearer) and web (cookies) both working.

---

## Provider mobile app

The **provider mobile app** also sends **`Authorization: Bearer <token>`** (and **`X-App: provider`**). The same rule applies: any route it calls must use **`getSupabaseServer(request)`** and/or **`requireRoleInApi(..., request)`**.

- **`/api/provider/*`** routes already use request-based auth (no `getSupabaseServer()` without `request` in `apps/web/src/app/api/provider/`).
- **`/api/me/portal`** and **`/api/provider/profile`** (used at app entry) and **`/api/me/support-tickets/...`** (used from provider support screens) are under the fixed `/api/me/*` and provider trees, so the provider app does not hit cookie-only auth.

When adding new **provider** API routes, use **`getSupabaseServer(request)`** and **`requireRoleInApi(..., request)`** (or the existing provider auth helpers that accept `request`) so mobile continues to work.

---

## Known gap (customer app)

The customer app calls **POST /api/me/membership/subscribe** from the partner-profile screen (Subscribe to a provider membership plan). That route does **not** exist today; only **GET /api/me/membership** and **POST /api/me/membership/cancel** exist. Implementing **POST /api/me/membership/subscribe** (or wiring the UI to an existing endpoint such as **POST /api/me/memberships/purchase**) would complete the flow. Until then, the Subscribe action on partner-profile will receive a 404.
