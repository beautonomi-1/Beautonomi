# Admin Portal — Role Model

> What the superadmin can do and how enforcement is implemented.

## Who is a superadmin?

- **Role value**: `superadmin` (stored in user profile / auth metadata; see `UserRole` in `@/types/beautonomi`).
- **Assignment**: Manually (e.g. Supabase dashboard or internal tooling); no self-service.

## What superadmin can do

- **Full read**: Users, providers, bookings, refunds, payouts, verifications, disputes, support tickets, audit logs, finance summary/transactions, reports, exports, feature flags, API keys, config/catalog/content, notifications, webhooks, etc.
- **Critical writes**:
  - Provider: approve, suspend, reject, verify; overrides; payout accounts; distance settings.
  - User: change role, set password, deactivate, impersonate; bulk actions.
  - Booking: cancel, refund, open/resolve dispute.
  - Refunds / payouts: create, approve, reject, mark paid/failed.
  - Verifications: approve, reject (with audit).
  - Feature flags: create, update, delete.
  - API keys: create, revoke, update.
  - Broadcast: send email, push, SMS.
  - Config: notification templates, catalog, content, settings, fees, etc.
- **Audit**: View audit logs; export data (within policy).

## How enforcement is implemented

### 1. UI (pages under `/admin`)

- **Layout guard**: `apps/web/src/app/admin/layout.tsx` wraps all admin pages in `<RoleGuard allowedRoles={["superadmin"]} redirectTo="/">`. Non-superadmin users are redirected to `/`.
- **No middleware**: There is no Next.js middleware in `apps/web` that protects `/admin`. Recommendation: add middleware that redirects unauthenticated or non-superadmin requests to `/` for defense in depth.

### 2. API (routes under `/api/admin/**`)

- **Per-route**: Every admin API route handler calls one of:
  - `requireRole(["superadmin"])` from `@/lib/supabase/auth-server` (cookie/session), or
  - `requireRoleInApi(["superadmin"], request)` from `@/lib/supabase/api-helpers` (supports Bearer token for mobile and cookie for web).
- **Behavior**: Fails with 401/403 and does not execute handler logic if the user is missing or not superadmin.
- **Evidence**: 167+ admin `route.ts` files contain `requireRole` or `requireRoleInApi`; no admin API is intended to be public.

### 3. Data access

- **Supabase**: Admin routes use the server Supabase client (RLS applies with the authenticated user). For operations that must bypass RLS (e.g. cross-tenant reads, audit log write), the code uses the service-role client (e.g. `getSupabaseAdmin()`) only where necessary (e.g. `writeAuditLog`).
- **Secrets**: Admin APIs must not return secrets (e.g. full API key value after creation) to the client except when required once at creation; responses use `{ data, error }` and avoid leaking internal tokens.

### 4. Audit logging

- **Sensitive actions** are logged via `writeAuditLog()` in `@/lib/audit/audit.ts` (writes to `audit_logs` table with service-role). Examples: booking cancel, payout approve/reject, feature-flag create, provider status change. Actor is the superadmin user from the auth check.

## Summary

| Layer | Mechanism |
|-------|-----------|
| Page access | `RoleGuard` in admin layout (superadmin only) |
| API access | `requireRole(["superadmin"])` or `requireRoleInApi(["superadmin"], request)` in every admin route |
| Sensitive writes | Server-side validation + audit log where applicable |
| Middleware | Not present; recommended to add for `/admin` |

Only users with role `superadmin` should access `/admin` pages and `/api/admin/*` endpoints.
