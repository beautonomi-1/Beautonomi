# Provider mobile vs provider portal API alignment

Audit date: 2025-02. Ensures provider mobile app (Expo) and provider portal (Next.js) use the same API contracts.

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
