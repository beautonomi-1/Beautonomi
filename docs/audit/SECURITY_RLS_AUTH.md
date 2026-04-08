# Security, RLS & Auth Audit

> Generated: 2026-02-17

## Authentication Architecture

### Three Auth Modes

| Mode | Used By | Mechanism | Evidence |
|------|---------|-----------|----------|
| **Cookie-based** | Web app (browser) | Supabase SSR cookies via `@supabase/ssr` | `apps/web/src/lib/supabase/server.ts` |
| **Bearer token** | Mobile apps (Expo) | `Authorization: Bearer <supabase_access_token>` | `packages/api/src/client.ts` |
| **Service role** | Server-side admin ops | `SUPABASE_SERVICE_ROLE_KEY` env var | `apps/web/src/lib/supabase/api-helpers.ts` |

### Dual-Auth Pattern in API Routes

`requireRoleInApi()` in `apps/web/src/lib/supabase/api-helpers.ts` supports both modes:

1. Checks `Authorization` header first (mobile Bearer token)
2. Falls back to cookie-based session (web browser)
3. Validates user via `supabase.auth.getUser()` (server-verified, not just JWT decode)
4. Checks `role` from user metadata against allowed roles
5. Returns `{ user, supabase }` tuple for route use

### Role System

| Role | Stored In | Assignment |
|------|-----------|------------|
| `customer` | `auth.users.raw_user_meta_data.role` | Set during sign-up |
| `provider_owner` | `auth.users.raw_user_meta_data.role` | Set during provider sign-up |
| `provider_staff` | `auth.users.raw_user_meta_data.role` | Set when staff invite is accepted |
| `superadmin` | `auth.users.raw_user_meta_data.role` | Manually set in Supabase dashboard |

### Provider ID Resolution

`getProviderIdForUser(userId)` resolves provider context:
1. First checks `providers` table for `user_id` match (owner)
2. Then checks `provider_staff` table for `user_id` match (staff member)
3. Returns provider ID or null

**File:** `apps/web/src/lib/supabase/api-helpers.ts`

---

## Web proxy auth (Next.js 16)

**File:** `apps/web/src/proxy.ts` (`export async function proxy` — not `middleware.ts`)

| Route Pattern | Protection |
|---------------|------------|
| `/`, `/search`, `/explore`, static assets | Public |
| `/account-settings`, `/checkout`, `/booking`, `/profile` | Any authenticated user |
| `/provider/*` (except onboarding) | `provider_owner`, `provider_staff`, `superadmin` |
| `/admin/*` | `superadmin` only |
| `/api/*` | Skipped (self-authenticating) |

**Note:** Keep route-skip and role checks **centralized** in `proxy.ts` so behavior does not diverge across copies.

---

## Mobile Auth (Customer)

**File:** `apps/customer/src/providers/AuthProvider.tsx`

| Feature | Implementation |
|---------|---------------|
| Phone OTP | `supabase.auth.signInWithOtp({ phone })` → verify code |
| Email/Password | `supabase.auth.signInWithPassword()` and `signUp()` |
| OAuth | Google, Apple, Facebook via `expo-web-browser` + `expo-auth-session` |
| Session storage | Supabase AsyncStorage adapter |
| Auto-refresh | `AppState` listener: starts/stops on foreground/background |
| Role guard | Client-side only — no server enforcement on screen access |

## Mobile Auth (Provider)

**File:** `apps/provider/src/providers/AuthProvider.tsx`

| Feature | Implementation |
|---------|---------------|
| Phone OTP | Same as customer |
| Email/Password | Same as customer |
| OAuth | **NOT AVAILABLE** — provider app only supports OTP and email |
| Role metadata | Sets `role: "provider_owner"` during sign-up |

---

## Row-Level Security (RLS)

### RLS Status by Table Category

| Category | Tables | RLS Enabled | Notes |
|----------|--------|-------------|-------|
| User data | users, user_profiles, user_addresses | ✅ Yes | Users can read/write own data |
| Providers | providers, provider_locations | ✅ Yes | Owner can manage, public can read |
| Bookings | bookings, booking_services | ✅ Yes | Customer reads own, provider reads theirs |
| Financial | transactions, payment_methods | ⚠️ Partial | `finance_transactions` may lack RLS |
| Messaging | conversations, messages | ✅ Yes | Participant-only access |
| Content | page_content, faqs, categories | ✅ Yes (public read) | Anyone can read |
| Admin | platform_settings, feature_flags | ✅ Yes | Superadmin write, public read for some |
| Audit | audit_logs, activity_logs | ✅ Yes | Superadmin only |

### RLS Patterns Used

**1. Own-data pattern (customers):**
```sql
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);
```

**2. Provider ownership pattern:**
```sql
CREATE POLICY "Provider can manage own data" ON provider_locations
  FOR ALL USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid()
    )
  );
```

**3. Public read pattern:**
```sql
CREATE POLICY "Anyone can read services" ON offerings
  FOR SELECT USING (true);
```

**4. Service role bypass:**
All RLS policies are bypassed by the service role key (used for admin operations).

### Critical RLS Gaps

| Table | Issue | Risk |
|-------|-------|------|
| `finance_transactions` | No RLS policy found | Financial data exposed to any authenticated user |
| `payment_transactions` | No RLS policy found | Payment data exposed |
| `webhook_events` | No RLS policy found | Webhook payloads exposed |
| `portal_tokens` | RLS unclear | Could allow token enumeration |

---

## Permission System (Provider Staff)

### Permission Checks

`requirePermission(providerId, userId, permissionKey)` in API routes:
- Calls Supabase RPC `has_permission(provider_id, user_id, permission_key)`
- Provider owners automatically have all permissions
- Staff permissions are resolved through: direct grants → role permissions → deny

### Permission Keys (from `staff_permissions`)

Common permission keys found in route guards:
- `bookings.view`, `bookings.create`, `bookings.edit`, `bookings.cancel`
- `clients.view`, `clients.edit`
- `services.manage`
- `staff.manage`, `staff.view`
- `finance.view`, `finance.manage`
- `reports.view`
- `settings.manage`

---

## Security Vulnerabilities Summary

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | 🔴 **CRITICAL** | Paystack proxy routes (7) have no auth | `apps/web/src/app/api/paystack/*/route.ts` |
| 2 | 🔴 **CRITICAL** | Email/SMS send endpoints have no auth | `apps/web/src/app/api/notifications/send-email/route.ts` |
| 3 | 🟠 **HIGH** | Financial tables may lack RLS | `beautonomi/supabase/migrations/` |
| 4 | 🟠 **HIGH** | Cron routes use only shared secret (no IP allowlist) | `apps/web/src/app/api/cron/*/route.ts` |
| 5 | 🟡 **MEDIUM** | `/api/availability` exposes scheduling data publicly | `apps/web/src/app/api/availability/route.ts` |
| 6 | 🟡 **MEDIUM** | Admin impersonation lacks audit trail completeness | `apps/web/src/app/api/admin/users/[id]/impersonate/route.ts` |
| 7 | 🟡 **MEDIUM** | Duplicate route-skip / auth branches in proxy | `apps/web/src/proxy.ts` |
| 8 | 🔵 **LOW** | Placeholder Supabase URL fallback | `apps/web/src/lib/supabase/server.ts` |
| 9 | 🔵 **LOW** | Provider mobile app lacks OAuth | `apps/provider/src/providers/AuthProvider.tsx` |
| 10 | 🔵 **LOW** | `/api/explore/debug` has no auth | `apps/web/src/app/api/explore/debug/route.ts` |

---

## Action Items

- [x] **CRITICAL:** Add `requireRoleInApi()` to all `/api/paystack/*` routes — Done: auth added to `initialize` and `verify`
- [x] **CRITICAL:** Add auth to notification send endpoints — Done: `requireRoleInApi(['superadmin', 'provider_owner'])` added
- [x] **HIGH:** Audit and add RLS to `finance_transactions`, `payment_transactions`, `webhook_events` — Done: Migration 230
- [x] **HIGH:** Add IP allowlisting for cron routes (Vercel cron IPs) — Done: `verifyCronRequest()` helper with Vercel ID verification, all 5 cron routes updated
- [x] **MEDIUM:** Fix duplicate boundary logic — Done: consolidated in `proxy.ts` (no `middleware.ts`)
- [x] **MEDIUM:** Add complete audit logging for admin impersonation — Done: reason required, rate limiting (5/hour), IP/user-agent logged, end-session audit entry
- [x] **MEDIUM:** Replace Supabase placeholder URL with loud error — Done: `FATAL` error thrown in `server.ts` if URL/key missing or placeholder
- [x] **LOW:** Consider adding OAuth to provider mobile app — Done: Google + Apple OAuth added matching customer app patterns
- [x] **LOW:** Add auth to `/api/explore/debug` — Done: `requireRoleInApi(["superadmin"])` added
