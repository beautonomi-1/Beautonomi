# Provider mobile vs provider portal API alignment

Audit date: 2025-02. Ensures provider mobile app (Expo) and provider portal (Next.js) use the same API contracts.

**See also:** [BOOKING_FLOW_ALIGNMENT.md](./BOOKING_FLOW_ALIGNMENT.md) — how customer app booking flow (holds, consume, on-demand) maps to provider app screens and APIs.

## Endpoints used by mobile (aligned)

| Endpoint | Method | Mobile usage | Portal API | Status |
|----------|--------|--------------|------------|--------|
| `/api/provider/bookings` | GET | List (start_date, end_date) | Returns `Booking[]` | OK |
| `/api/provider/bookings/[id]` | GET | Detail | Returns single booking, `group_bookings!fkey` | OK |
| `/api/provider/resources` | GET, POST | List, create | Array + create | OK |
| `/api/provider/resources/[id]` | PATCH, DELETE | Update, delete | PATCH/DELETE | OK |
| `/api/provider/resource-groups` | GET, POST | List, create | Array + create | OK |
| `/api/provider/resource-groups/[id]` | PATCH, DELETE | Update, delete | PATCH/DELETE | OK |
| `/api/provider/product-orders` | GET | List (limit, status) | `{ orders, pagination }` | OK |
| `/api/provider/product-orders/[id]` | GET, PATCH | Detail `{ order }`, update | Same shape | OK |
| `/api/provider/returns` | GET | List (limit, status) | `{ returns, pagination }` | OK |
| `/api/provider/returns/[id]` | GET, PATCH | Detail `{ return_request }`, actions | Same shape | OK |
| `/api/provider/services` | GET | List | Array of offerings | OK |
| `/api/provider/services/[id]` | GET | Detail | **Fixed:** now uses `requireRoleInApi(request)` + `successResponse` for mobile Bearer auth | Fixed |
| `/api/provider/products` | GET, POST | List (limit), create | `{ products, total, page, limit }` | OK |
| `/api/provider/products/[id]` | PATCH, DELETE | Update, delete | successResponse | OK |
| `/api/provider/staff` | GET, POST | List (?location_id=), create | Array, location filter | OK |
| `/api/provider/locations` | GET | List | Array | OK |
| `/api/provider/forms` | GET, POST | List, create | Array + create | OK |
| `/api/provider/forms/[id]` | PUT, DELETE | Update, delete | PUT/DELETE | OK |
| `/api/provider/forms/[id]/fields` | POST | Add field | POST | OK |
| `/api/provider/forms/[id]/fields/[fieldId]` | PATCH/DELETE | Update/delete field | See route | OK |
| `/api/provider/settings/business` | GET | Settings tab | Business settings | OK |
| `/api/provider/subscription` | GET | Settings tab | Subscription or null | OK |
| `/api/provider/billing-history` | GET | Settings tab | Invoices array | OK |
| `/api/provider/reports/products/inventory` | GET | Inventory tab | Inventory metrics | OK |
| `/api/provider/team` | GET | New booking (staff list) | Alias for staff; `?location_id=` supported | OK |
| `/api/provider/settings/payments` | GET | New booking (tax/tax-inclusive) | Returns `taxRatePercent`, `taxInclusive`, etc. | OK (mobile aligned) |
| `/api/provider/referral-sources` | GET | New booking | Array `{ id, name, is_active }` | OK |
| `/api/provider/clients` | GET | New booking (client search) | `?search=`; returns `{ ...client, customer }` | OK |
| `/api/provider/bookings/available-slots` | GET | New booking | `?date=&duration_minutes=&staff_ids=&location_id=` → `{ slots, date }` | OK |
| `/api/provider/bookings/check-availability` | GET | New booking | Returns `{ available?, conflicts? }` | OK |
| `/api/provider/bookings` | POST | New booking (create) | Body: `scheduled_at`, `customer_id`, services, amounts, etc. | OK |
| `/api/provider/custom-requests` | GET | List (inbox) | Array of requests with customer, attachments, offers | OK |
| `/api/provider/custom-requests/[id]` | GET | Detail (single request) | Single request, same shape as list item; 404 if not found | OK |
| `/api/provider/custom-requests/[id]/offers` | POST | Send offer | Body: price, currency, duration_minutes, expiration_at, etc. | OK |
| `/api/provider/staff/[id]/permissions` | GET | Load permissions for one staff member | `{ permissions: Record<string, boolean> }` (24 keys) | OK |
| `/api/provider/staff/[id]/permissions` | PATCH | Save permissions (owner only) | Body: `{ permissions: Record<string, boolean> }` | OK |
| `/api/provider/time-clock` | GET | List time cards (Time clock screen) | Array of time cards | OK |
| `/api/provider/time-clock` | POST | PIN clock-in | Body: `{ pin }` | OK |
| `/api/provider/staff/[id]/time-clock/clock-in` | POST | Clock in a staff member | Optional body | OK |
| `/api/provider/staff/[id]/time-clock/clock-out` | POST | Clock out a staff member | Optional body | OK |
| `/api/provider/time-clock/[id]` | PATCH | Update time card (clock_in_time, clock_out_time, notes) | Body: partial time card | OK |
| `/api/provider/pay-runs` | GET | Payroll list | Array / paginated | OK |
| `/api/provider/pay-runs` | POST | Create pay run | Body per API | OK |
| `/api/provider/pay-runs/my-earnings` | GET | My earnings (staff) | Earnings data | OK |
| `/api/provider/routes` | GET, POST | Routes screen (at-home optimization) | Same as portal | OK |
| `/api/provider/packages` | GET | Packages list | Same as portal | OK |
| `/api/provider/ads/campaigns` | GET | Paid ads campaigns | Same as portal | OK |

## Staff permissions (mobile parity)

- **GET/PATCH `/api/provider/staff/[id]/permissions`**  
  Mobile screen `staff-permissions/[id].tsx` shows all 24 permission toggles in 9 categories (Calendar, Sales, Services & Products, Team, Settings, Clients, Reviews, Messages, Explore), aligned with web and `StaffPermissions` in `apps/web/src/lib/auth/permissions.ts`. State is merged with API response so missing keys default to `false`. Save uses PATCH with full `permissions` object; on error shows `Alert.alert`. Only provider owners (and superadmin) can update; API returns 403 for staff.

## Time clock & pay-runs

- **Time clock:** Mobile `more/time-clock.tsx` uses GET/POST `/api/provider/time-clock` (list cards, PIN clock), POST `/api/provider/staff/[id]/time-clock/clock-in` and `.../clock-out`, PATCH `/api/provider/time-clock/[id]`. Accessible from More → Team & scheduling (Team screen) and Settings → Team → Time clock.
- **Pay-runs:** Mobile payroll and my-earnings use `/api/provider/pay-runs` and `/api/provider/pay-runs/my-earnings`; same contracts as portal.

## Fix applied

- **GET/PATCH/DELETE `/api/provider/services/[id]`**  
  Previously used `requireRole()` (cookie-only auth), so mobile Bearer token was ignored and auth failed.  
  Updated to use `requireRoleInApi(['provider_owner','provider_staff'], request)`, `getProviderIdForUser`, and `successResponse` / `notFoundResponse` / `handleApiError` so mobile and portal share the same auth and response shape.

## Response shape convention

- All provider API success responses use `{ data: T, error: null }` (via `successResponse()`).
- Mobile client (`@beautonomi/api`) uses `result.data`; list/detail shapes match mobile types (e.g. `{ order }`, `{ return_request }`, arrays).

## Role/permission alignment

- Resource groups: portal allows POST/PATCH/DELETE for `provider_owner` and `superadmin` only; mobile can show UI but API will return 403 for staff. No change.
- Other endpoints use `provider_owner`, `provider_staff`, or `superadmin` as in portal.

## Data schema alignment (mobile vs API/DB)

- **Resources**  
  DB table `resources` has no `resource_type` or `calendar_color` columns (only id, provider_id, group_id, name, description, capacity, is_active, created_at, updated_at).  
  Mobile `Resource` type was updated to make `resource_type` and `calendar_color` optional so the API response (which omits them) is valid. The UI uses `typeInfo(resource.resource_type)` which handles `undefined`/`null`.

- **Forms**  
  API returns `updated_at`; mobile `FormTemplate` now includes optional `updated_at` so the response shape matches.

- **New booking – payment settings**  
  GET `/api/provider/settings/payments` returns `taxRatePercent` and `taxInclusive` (camelCase). Mobile was using `tax_rate`/`tax_inclusive` and thus always fell back to defaults. Updated `PaymentSettings` and summary to use `taxRatePercent`/`taxInclusive`, and the create-booking payload now sends `tax_rate: summary.taxRatePercent` (percentage, e.g. 15) so the API stores the correct rate.

- **Bookings list**  
  API returns each booking with `services[]` where each item has `name`, `offering_name`, `staff_name`, etc. Mobile list and detail types match.

- **Products, product-orders, returns, staff, locations, settings, subscription, billing-history, inventory**  
  Response shapes verified; mobile types align with API (including optional pagination/metadata where used).

## Settings – all native

- **Calendar display** → native `more/settings/calendar-preferences` (GET/PATCH `/api/provider/settings/calendar-preferences`).
- **Calendar colors & icons** → native `more/settings/calendar-colors-icons` (info screen + “Open on web” to portal for full CRUD).
- **Calendar links** → native `more/settings/calendar-links` (info screen + “Open on web” to portal for full CRUD).
- **Waitlist settings** → native `more/settings/waitlist-settings` (GET/PATCH `/api/provider/settings/waitlist`).
- **Payout center** → native `more/payouts`.

## Error handling (2025-03)

- **Resources screen** (`more/resources.tsx`): Initial load failure for resources or resource-groups now shows `ErrorState` with retry (both lists refreshed on retry).
- **Express booking** (`more/express-booking.tsx`): Short links list load failure shows inline error message and "Try again" instead of an empty list.
- **Custom request detail** (`more/custom-requests/[id].tsx`): Uses GET `/api/provider/custom-requests/[id]` for the single request (no longer derived from list). Shows `ErrorState` with retry on error or not found.
