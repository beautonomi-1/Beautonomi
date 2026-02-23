# Admin Portal — Test Plan

> Smoke tests, regression tests, and a 30–45 minute human-run checklist.

## 1. Smoke tests (quick)

Run these first to confirm core flows.

| # | Action | Expected |
|---|--------|----------|
| 1 | Log in as **non-superadmin** and open `/admin` | Redirect to `/` (or login). |
| 2 | Log in as **superadmin** and open `/admin` | Admin shell with sidebar; dashboard or first page loads. |
| 3 | Call `GET /api/admin/dashboard` without auth | 401 or 403. |
| 4 | Call `GET /api/admin/dashboard` as superadmin | 200, body has stats (or `{ data, error }`). |
| 5 | Open Feature Flags (Control Plane or Settings); load list | List loads; no console/network errors. |
| 6 | Create a feature flag (Settings) | Success toast; new row in list. |
| 7 | As superadmin, cancel a booking (with reason) | Success; `audit_logs` has `action = 'admin.booking.cancel'` for that booking. |

## 2. Regression tests (critical APIs)

Target high-risk admin actions. Prefer automated Vitest tests where possible.

| Area | Test | Type |
|------|------|------|
| Provider status | PATCH provider status (approve/suspend/reject) as superadmin → 200; as non-superadmin → 403 | Vitest + manual |
| Refunds | POST create/approve refund as superadmin → 200; invalid body → 400 | Vitest + manual |
| Payouts | POST approve/reject payout as superadmin → 200; audit log entry created | Vitest + manual |
| Broadcast | POST broadcast email/push as superadmin → 200; as non-superadmin → 403 | Vitest + manual |
| Feature flags | PATCH feature flag as superadmin → 200; GET list returns `data` array | Vitest + manual |
| User impersonate | POST impersonate as superadmin → 200 and token/url; as non-superadmin → 403 | Manual |

## 3. Vitest — where to add tests

- **Location**: e.g. `apps/web/src/app/api/admin/**/*.test.ts` or `apps/web/__tests__/api/admin/**`.
- **Focus**: Call route handlers with mocked Supabase and auth; assert status and `{ data, error }` shape.
- **Examples**:
  - `feature-flags/route.test.ts`: GET returns `{ data: array, error: null }`; POST with invalid body returns 400 and `error`.
  - `bookings/[id]/cancel/route.test.ts`: POST with superadmin auth returns 200 and audit log written (mock `writeAuditLog`).
  - `payouts/[id]/approve/route.test.ts`: POST as superadmin returns 200; without auth returns 403.
  - `broadcast/push/route.test.ts`: POST as superadmin returns 200; body validated.

## 4. Human checklist (30–45 minutes)

Run as a **superadmin** user in a test environment.

### Access and navigation

- [ ] Open `/admin` → dashboard or default page loads.
- [ ] Navigate: Users, Providers, Bookings, Refunds, Payouts, Verifications, Disputes, Audit logs, Finance, Broadcast, API keys, Feature flags (both Control Plane and Settings), Reports, Support tickets.
- [ ] Each section loads without blank screen or uncaught errors; tables/lists show columns and at least empty state or data.

### Users

- [ ] User list: pagination/filters work; search by email/name.
- [ ] User detail: open a user; bookings sublist loads.
- [ ] Change role (if applicable): success toast and list refresh.
- [ ] Impersonate (if enabled): redirect or token received as expected.

### Providers

- [ ] Provider list: pagination/filters; status filter.
- [ ] Provider detail: open a provider; status/verify actions available.
- [ ] Change status (e.g. approve/suspend): success and optional audit log entry.

### Bookings

- [ ] Booking list: filters and pagination.
- [ ] Booking detail: cancel with reason → success; check audit log for `admin.booking.cancel`.
- [ ] Refund from booking: flow completes or shows expected validation.

### Refunds and payouts

- [ ] Refunds list: load and filter.
- [ ] Payouts list: load; approve or reject one payout (if test data exists) and confirm audit.

### Feature flags

- [ ] Control Plane → Feature flags: list loads from `GET /api/admin/feature-flags` (network tab shows `data` array).
- [ ] Settings → Feature flags: list and create new flag; edit and delete (if applicable).

### Broadcast and API keys

- [ ] Broadcast: send test email or push (to a test segment) → success or expected validation.
- [ ] API keys: list; create key (confirm secret shown once only); revoke/delete.

### Exports and reports

- [ ] Export users or bookings (small range) → file or stream without 500.
- [ ] Reports (revenue/bookings) → data or empty state, no crash.

### Security

- [ ] Log out; open `/admin` → redirected to login or home.
- [ ] Log in as **customer** or **provider**; open `/admin` → redirected away from admin.
- [ ] Call `GET /api/admin/users` as customer → 403.

---

## 5. Sign-off

| Date | Tester | Environment | Pass (Y/N) | Notes |
|------|--------|-------------|------------|-------|
| | | dev / staging | | |

After fixes from the audit, run at least the smoke tests and the human checklist once before release.
