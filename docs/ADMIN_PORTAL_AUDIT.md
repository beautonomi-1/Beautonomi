# Superadmin Portal — Audit Report

> Generated: 2026-02-22  
> Scope: `apps/web` — admin UI (`src/app/admin/**`), admin APIs (`src/app/api/admin/**`), admin components (`src/components/admin/**`), auth helpers (`src/lib/supabase/**`, `src/lib/**`).

## Executive summary

- **Role enforcement**: Admin pages are gated by layout `RoleGuard` (superadmin only). All enumerated admin API routes use `requireRole` or `requireRoleInApi(["superadmin"])`. No Next.js middleware exists for `/admin`; adding middleware is recommended for defense in depth.
- **Data wiring**: Feature-flags list API and consumers were aligned to `{ data, error }`; control-plane and settings feature-flag pages plus `lib/feature-flags.ts` were updated accordingly.
- **Critical operations**: Booking cancel and feature-flag create already use audit logging; booking cancel was explicitly wired to `writeAuditLog` with `admin.booking.cancel`.
- **Fixes applied**: See table and “Fixes applied” section below.

---

## Route status table

Legend: **✅ Correct** | **⚠️ Needs follow-up** | **❌ Fixed in this pass**

### Admin pages (sample; full set under `src/app/admin/**`)

| Route | Purpose | Status | Notes |
|-------|---------|--------|--------|
| `/admin` | Dashboard / redirect | ✅ | RoleGuard in layout |
| `/admin/dashboard` | Dashboard | ✅ | Uses admin dashboard API |
| `/admin/users` | User list | ✅ | Uses admin users API |
| `/admin/users/[id]` | User detail | ✅ | Uses admin users API |
| `/admin/providers` | Provider list | ✅ | Uses admin providers API |
| `/admin/providers/[id]` | Provider detail | ✅ | Uses admin providers API |
| `/admin/bookings` | Booking list | ✅ | Uses admin bookings API |
| `/admin/bookings/[id]` | Booking detail | ✅ | Uses admin bookings API |
| `/admin/refunds` | Refunds | ✅ | Uses admin refunds API |
| `/admin/payouts` | Payouts | ✅ | Uses admin payouts API |
| `/admin/control-plane/feature-flags` | Feature flags (control-plane) | ❌ Fixed | Now consumes `data` from GET `/api/admin/feature-flags` |
| `/admin/settings/feature-flags` | Feature flags (settings) | ✅ | Uses `getAllFeatureFlags()` which now expects `{ data, error }` |
| `/admin/verifications` | Verifications | ✅ | Uses admin verifications API |
| `/admin/disputes` | Disputes | ✅ | Uses admin disputes API |
| `/admin/audit-logs` | Audit logs | ✅ | Uses admin audit-logs API |
| `/admin/finance` | Finance | ✅ | Uses admin finance API |
| `/admin/broadcast` | Broadcast | ✅ | Uses admin broadcast API |
| `/admin/api-keys` | API keys | ✅ | Uses admin api-keys API |
| (Other admin pages) | Various | ✅ | Same layout guard; APIs have role checks |

### Admin API routes (all use role enforcement)

| API path pattern | Auth | Status | Notes |
|------------------|------|--------|--------|
| `GET/POST /api/admin/feature-flags` | requireRole superadmin | ❌ Fixed | GET/POST return `{ data, error }`; handleApiError in catch |
| `GET/PATCH/DELETE /api/admin/feature-flags/[id]` | requireRole superadmin | ✅ | Returns `{ featureFlag }` (legacy shape); consider aligning to `{ data, error }` later |
| `GET/POST /api/admin/bookings`, `.../bookings/[id]`, `.../cancel`, `.../refund`, `.../dispute/*` | requireRoleInApi/requireRole | ✅ | Booking cancel now logs to audit_logs |
| `GET/POST/PATCH /api/admin/users/*`, `.../impersonate`, `.../role`, `.../password` | requireRoleInApi/requireRole | ✅ | |
| `GET/PATCH /api/admin/providers/*`, `.../status`, `.../verify` | requireRoleInApi/requireRole | ✅ | Payout/verify flows use writeAuditLog where present |
| `GET/POST /api/admin/refunds/*`, `.../payments/[txId]/refund` | requireRoleInApi/requireRole | ✅ | |
| `GET/POST/PATCH /api/admin/payouts/*`, `.../approve`, `.../reject`, etc. | requireRoleInApi/requireRole | ✅ | Audit logging used on approve/reject |
| `GET/POST /api/admin/broadcast/*` | requireRoleInApi/requireRole | ✅ | |
| `GET/POST/PATCH/DELETE /api/admin/api-keys/*` | requireRoleInApi/requireRole | ✅ | |
| All other `/api/admin/**` route.ts | requireRole/requireRoleInApi | ✅ | 167+ route files contain role check |

---

## Fixes applied

1. **Booking cancel — audit logging**  
   - **File**: `apps/web/src/app/api/admin/bookings/[id]/cancel/route.ts`  
   - **Issue**: Audit log not written on admin cancel.  
   - **Change**: After cancelling the booking, call `writeAuditLog` with `action: "admin.booking.cancel"`, `entity_type: "booking"`, `entity_id: id`, and metadata (reason, booking_number). Actor from `requireRoleInApi`.

2. **Feature-flags API — response shape and errors**  
   - **File**: `apps/web/src/app/api/admin/feature-flags/route.ts`  
   - **Issue**: GET returned `{ featureFlags }`, POST returned ad-hoc shape; errors not in `{ data, error }` form.  
   - **Change**: GET returns `{ data: featureFlags ?? [], error: null }`; on DB error returns `{ data: null, error: { message, code } }`. POST returns `{ data: featureFlag, error: null }` on success; validation/DB errors return `{ data: null, error: { message, code } }`. Catch uses `handleApiError`.

3. **Feature-flags consumers — use `data`**  
   - **Files**: `apps/web/src/app/admin/control-plane/feature-flags/page.tsx`, `apps/web/src/lib/feature-flags.ts`  
   - **Issue**: Control-plane page and `getAllFeatureFlags()` expected `featureFlags` / `res.featureFlags`.  
   - **Change**: Control-plane page uses `res.data` from GET. `getAllFeatureFlags()` parses `data.data` and treats `data.error` as failure. `createFeatureFlag()` uses `data.data` for POST response.

---

## Remaining TODOs

- **Middleware**: Add Next.js middleware for `/admin/**` that redirects unauthenticated or non-superadmin users (defense in depth; layout already enforces).
- **Feature-flags [id]**: Optionally align GET/PATCH/DELETE `/api/admin/feature-flags/[id]` to `{ data, error }` and update any callers.
- **Pagination**: Verify all large list endpoints (users, providers, bookings, transactions, audit logs) support limit/offset or cursor and that UIs use them.
- **Idempotency**: Add idempotency keys for critical write actions (refunds, payouts, verification decisions, broadcast) where not already present.
- **Vitest**: Add or expand API tests for provider status change, refunds, payouts, broadcast (see ADMIN_PORTAL_TEST_PLAN.md). **Done**: `apps/web/src/app/api/admin/feature-flags/__tests__/route.test.ts` (GET/POST response shape, auth reject, validation).

---

## How to verify locally

1. **Role enforcement**: Log in as non-superadmin → visit `/admin` → should redirect to `/`. Call any `/api/admin/*` without superadmin → 403.
2. **Feature flags**: As superadmin, open Control Plane → Feature Flags and Settings → Feature Flags; list and create should work; errors show toasts.
3. **Booking cancel**: As superadmin, cancel a booking with reason; check `audit_logs` for `action = 'admin.booking.cancel'`.
4. Run the smoke test checklist in `docs/ADMIN_PORTAL_TEST_PLAN.md` (30–45 min).

---

## Route inventory (detailed)

The following admin page routes were inventoried from the Superadmin portal (reference). All require superadmin; APIs use `requireRole` or `requireRoleInApi(["superadmin"])`.

| Route path | Key APIs | Purpose |
|------------|----------|---------|
| `/admin`, `/admin/dashboard` | portal, dashboard | Redirect, dashboard |
| `/admin/gods-eye`, `/admin/analytics` | gods-eye, analytics | Gods eye, analytics |
| `/admin/reports`, `/admin/reports/revenue`, `bookings`, `providers`, `customers`, `gift-cards` | reports/*, export/* | Reports |
| `/admin/providers`, `/admin/providers/[id]`, `distance-settings` | providers/* | Providers |
| `/admin/staff`, `/admin/bookings`, `/admin/bookings/[id]` | staff, bookings, cancel, refund, dispute | Staff, bookings |
| `/admin/reviews`, `/admin/disputes`, `/admin/user-reports`, `/admin/refunds` | reviews, disputes, refunds | Reviews, disputes, refunds |
| `/admin/support-tickets`, `/admin/support-tickets/[id]` | support-tickets, messages | Support tickets |
| `/admin/finance`, `/admin/payouts`, `/admin/fees`, `/admin/billing` | finance, payouts, fees, invoices | Finance |
| `/admin/users`, `/admin/users/[id]` | users, impersonate, password, export | Users |
| `/admin/verifications`, `/admin/content`, `/admin/iso-codes`, `/admin/mapbox` | verifications, content/*, iso-codes, mapbox | Verifications, content, mapbox |
| `/admin/settings/*`, `/admin/subscription-plans`, `/admin/addons`, `/admin/security` | settings, feature-flags, travel-fees, addons, security | Settings, plans, addons, security |
| `/admin/notifications`, `/admin/broadcast`, `/admin/notification-templates`, `email-templates`, `sms-templates` | notifications, broadcast, templates | Notifications, broadcast |
| `/admin/system-health`, `/admin/monitoring`, `/admin/api-keys`, `/admin/webhooks`, `/admin/audit-logs` | system-health, monitoring, api-keys, webhooks, audit-logs | System, audit |
| `/admin/control-plane/*`, `/admin/control-plane/overview`, `feature-flags`, `audit-log`, `safety-logs`, `integrations/*`, `modules/*` | feature-flags, config-change-log, safety, integrations, modules (ai, ads, distance, ranking, on-demand) | Control plane |
| `/admin/ecommerce/*`, `/admin/gamification/*`, `/admin/loyalty`, `/admin/promotions`, `/admin/catalog`, `/admin/explore` | product-orders, products, returns, badges, point-rules, loyalty, promotions, catalog, explore | E-commerce, gamification, content |
| `/admin/automations`, `/admin/custom-fields`, `/admin/integrations/amplitude` | automations, custom-fields, amplitude | Automations, custom fields, Amplitude |

Full page-by-page inventory (page file, components, data dependencies) was documented in the 2025-03-03 Superadmin audit; the above summarizes route → API mapping. QA checklist: `docs/SUPERADMIN_QA_CHECKLIST.md`.

---

## References

- Role model: `docs/ADMIN_PORTAL_ROLE_MODEL.md`
- Data contracts: `docs/ADMIN_PORTAL_DATA_CONTRACTS.md`
- Test plan: `docs/ADMIN_PORTAL_TEST_PLAN.md`
- Auth helpers: `apps/web/src/lib/supabase/api-helpers.ts` (`requireRoleInApi`, `successResponse`, `errorResponse`, `handleApiError`)
- Audit: `apps/web/src/lib/audit/audit.ts` (`writeAuditLog`)
