# Provider location (branch) scoping – global location selector

The **global location selector** in the provider mobile app and provider portal web filters or scopes data by the selected branch. This doc summarizes what is branch-aware and what is provider-level only.

---

## Where the location selector is used

- **Provider mobile app:** `useProvider().selectedLocationId` is persisted in AsyncStorage; screens pass `location_id` (or `?location_id=...`) to APIs.
- **Provider portal (web):** `ProviderPortalProvider` stores `selectedLocationId` and persists to `localStorage` and backend (`provider.selected_location_id`). API calls include `location_id` in query params when a location is selected.

When **no location** is selected (or “All locations”): most APIs return **all** data across branches. When a **specific branch** is selected: list and report APIs filter by that `location_id`.

---

## Branch-scoped (location_id) – correct for availability and reporting

| Area | Schema / behaviour | Location selector usage |
|------|--------------------|-------------------------|
| **Bookings** | `bookings.location_id` (at_salon). Each booking is tied to one branch. | **Dashboard**, **Calendar**, **More → Bookings list**: filter by `location_id`. New booking (mobile/web) uses `selectedLocationId` as default for at_salon. |
| **Staff** | `provider_staff_locations(staff_id, location_id)` – staff are assigned to one or more branches. | **Team**: with `location_id` returns only staff assigned to that location. **Staff availability** and **New sale/booking** use `location_id` so only staff at that branch are shown. |
| **Availability / time blocks** | `availability_blocks.location_id` (null = all locations). Time blocks are per staff; staff are per location. | **Calendar** (bookings, team, time-blocks, waiting-room count) and availability APIs filter by `location_id` when provided. |
| **Services (offerings)** | `offerings` are provider-level; **`offering_locations(offering_id, location_id)`** defines which services are available at which branch. | **Services/available** API: when `locationId` is passed, only offerings linked to that location (or to no location = all) are returned. So booking and availability see the right services per branch. |
| **Sales** | `sales.location_id`. Each sale is tied to a branch. | **Sales** and **Sales history** pass `location_id` so only sales for the selected branch are shown. |
| **Finance** | Transactions are joined to bookings; bookings have `location_id`. | **Finance** (main tab and **More → Finance**) and **Unpaid bookings** filter by `location_id` when selected. |
| **Reports** | Bookings and related data have `location_id`. | **Reports** (sales summary, bookings summary, business overview) accept `location_id` and filter by branch. |
| **Ratings** | `provider_client_ratings.location_id`. | **Ratings list** can filter by `location_id`. |
| **Yoco devices** | `provider_yoco_devices.location_id` – each terminal is assigned to a branch. | Device management is per location; payment flow uses the booking’s `location_id` to pick the correct terminal. |
| **E‑commerce (product orders)** | `product_orders.collection_location_id` for collection. | Collection is at a specific branch; delivery uses customer address. **More → Reports → Products** passes `location_id`; product report counts only orders collected at that location. |
| **Clients** | No `location_id` on `provider_clients`; client list is provider-wide. | **Clients** and **Serviced clients** APIs accept `location_id`: they filter by **bookings** at that location (e.g. “clients who booked at this branch”). So the list is effectively branch-filtered when location is selected. |
| **Closed periods** | Stored per location (e.g. `time_blocks` / location-specific config). | **Closed periods** and **Operating hours** are per location; UI uses the selected location or a location picker. |
| **Waiting room (Front Desk)** | Bookings have `location_id`. | **GET /api/provider/waiting-room** and **waiting-room/count** accept `location_id`; **More → Front Desk** passes it when a location is selected. |
| **Custom requests** | Requests are provider-level; **offers** have `location_id`. | **GET /api/provider/custom-requests** accepts optional `location_id`: when set, returns only requests with no offers (unclaimed) or with at least one offer at that location. **More → Custom requests** passes it when selected. |

So for **availability**, **bookings**, **staff**, **services (offerings)**, **sales**, **reports**, **finance**, **ratings**, **Yoco**, **e‑commerce collection**, **client lists (via bookings)**, **waiting room**, and **custom requests (by offer location)**: the global location selector correctly scopes or filters by branch.

---

## Provider-level only (no branch column)

| Area | Schema / behaviour | Implication |
|------|--------------------|-------------|
| **Products (e‑commerce)** | Products are provider-level; **collection** is branch-specific via `product_orders.collection_location_id`. | Product catalog is shared; only “where to collect” is per branch. |
| **Discount codes / promotions** | Bookings have `discount_code` / `promotion_id`; promotions/coupons are typically provider or platform level. | Discounts apply to the booking (which has a branch); there is no separate “this discount only at branch X” in the current schema. |
| **Provider clients** | `provider_clients.provider_id` only. | One client list per provider; “which branch” is reflected by filtering **bookings** by `location_id` when showing clients who booked at the selected branch. |

---

## Branch-scoped add-ons, packages, promotions (migration 245)

- **Add-ons:** `addon_locations(addon_id, location_id)`. No rows = all locations; with rows = only those. **GET /api/provider/addons** and **GET /api/public/addons** accept `location_id`. Booking validation enforces addon at location for at_salon.
- **Packages:** `package_locations(package_id, location_id)`. Same. **GET /api/provider/packages** and **GET /api/public/providers/[slug]/packages** accept `location_id`. Booking validation enforces package at location.
- **Promotions:** `promotions.location_id` (nullable). NULL = any branch; set = only at_salon at that location. Booking validation: promo applies only if booking location matches when `promotion.location_id` is set.

To assign add-on or package to branches: insert into `addon_locations` or `package_locations` (UI/API can be added later).

---

## Summary

- **Global location selector** is used for: dashboard, **More → Activity** (dashboard API), calendar (bookings, team, time-blocks, waiting-room count), **More → Bookings** list, **More → New booking** (staff list and booking payload), **More → Reports** (bookings summary + **Bookings**, **Revenue**, **Services**, **Clients**, **Staff**, **Payments**, **Business**, **Products**, **Packages**, **Gift cards** report sub-screens), **More → Reviews**, **More → Engagement** (reviews list in hub), **More → Front Desk** (waiting room), **More → Custom requests**, team, staff availability, new booking/sale, sales history, finance (main and **More → Finance**), reports, ratings, clients (via booking filter), closed periods / operating hours, Yoco devices, e‑commerce collection, addons, and packages (when `location_id` is passed).
- **Branch-scoped:** bookings, staff, availability blocks, services (offering_locations), add-ons (addon_locations), packages (package_locations), promotions (location_id), sales, finance, reports, ratings, Yoco, product order collection, client lists (by bookings at branch).
- **Provider-level only:** product catalog (collection is per order), provider_clients list (filtering by bookings at branch is supported).

---

## Location scoping audit (provider app)

The following were updated so that **when a location is selected, staff at one salon do not see another salon’s data**:

| Screen / API | Change |
|--------------|--------|
| Dashboard | KPIs, today/upcoming, weekly-revenue, top-services, activity use `location_id` when set. |
| Calendar | Bookings, team, time-blocks, waiting-room count use `location_id` when set. |
| More → Bookings list | Passes `location_id` to GET /api/provider/bookings. |
| More → New booking | Staff list from team API with `location_id`; booking payload uses selected location. |
| More → Activity | Dashboard API with `location_id`. |
| More → Finance | Finance API with `location_id`. |
| More → Front Desk | Waiting-room list and count with `location_id`. |
| More → Custom requests | List filtered by offer location or unclaimed. |
| More → Reports | Summary + Bookings, Revenue, Services, Clients, Staff, Payments, Business, Products, Packages, Gift cards all pass `location_id` when set. |
| More → Reviews | Reviews API filters by booking location. |
| More → Engagement | Reviews list with `location_id`. |
| Clients tab | Clients/serviced/conversations APIs with `location_id`. |
| Sales tab | Dashboard and sales APIs with `location_id`; staff filtered by location. |
| Sales history | URL includes `location_id` when set. |

**Intentionally provider-wide (no location filter):** Messaging/conversations, waitlist, recurring appointments list, group bookings list (schema has no `location_id` on `group_bookings`), notifications, catalogue/services list (provider-level; booking uses offering_locations), settings, forms, marketing. To scope any of these by location later, add `location_id` support to the relevant API and pass `selectedLocationId` from the app.
