# Provider “More” menu – data & persistence audit

This doc maps each **More** menu item to its screen, API(s), and how data is loaded/saved so you can see what persists and where to change it.

---

## Clients screen (main tab)

- **Screen:** `(tabs)/clients.tsx`
- **APIs:**  
  - `GET /api/provider/clients` – saved clients (provider_clients)  
  - `GET /api/provider/clients/serviced` – customers with bookings  
  - `GET /api/provider/clients/conversations` – customers with conversations  
- **Persistence:** List is merged from all three. Creating a client uses `POST /api/provider/clients/create`. Edits use `PATCH /api/provider/clients/[id]`.
- **Note:** All these routes now pass the request for Bearer auth so the provider app can load clients correctly.

---

## Operations

| Menu item              | Route (under More)     | Data source / API (GET)                    | Persistence (POST/PATCH/DELETE)                    |
|------------------------|------------------------|-------------------------------------------|----------------------------------------------------|
| Bookings               | `more/bookings`        | `/api/provider/bookings`                  | PATCH/DELETE on bookings                           |
| Recurring Appointments | `more/recurring-appointments` | `/api/provider/recurring-appointments`   | Create/update/delete recurring                     |
| Group Bookings         | `more/group-bookings`  | `/api/provider/group-bookings`            | PATCH/DELETE group bookings                        |
| Waitlist               | `more/waitlist`        | `/api/provider/waitlist`                 | PATCH (update entry)                               |
| Front Desk             | `more/waiting-room`    | `/api/provider/waiting-room/*`           | Check-in / status updates                          |
| Express Booking        | `more/express-booking`| Link/config                               | N/A (link sharing)                                 |
| Resources              | `more/resources`      | `/api/provider/resources`               | POST/PATCH/DELETE resources                        |
| Forms                  | `more/forms`           | `/api/provider/forms`                    | POST/PATCH/DELETE forms                            |
| Custom Requests        | `more/custom-requests` | `/api/provider/custom-requests`          | Status/response updates                            |
| Routes                 | `more/routes`          | Route-planning APIs                       | Depends on implementation                          |
| Time Blocks            | `more/time-blocks`     | `/api/provider/time-blocks`              | POST/PATCH/DELETE                                  |
| Days Off               | `more/days-off`        | `/api/provider/days-off`                 | POST/DELETE                                        |

---

## E‑commerce & products

| Menu item           | Route              | Data source / API (GET)              | Persistence                          |
|---------------------|--------------------|--------------------------------------|--------------------------------------|
| Products & Inventory| `more/products`    | `/api/provider/products` (or catalog) | POST/PATCH/DELETE products           |
| Suppliers           | `more/suppliers`   | `/api/provider/suppliers`            | POST/PATCH/DELETE                    |
| Inventory Manager   | `more/inventory`   | `/api/provider/inventory`            | PATCH (stock levels)                 |
| Product Orders      | `more/product-orders` | `/api/provider/product-orders`    | Status updates                       |
| Returns & Refunds   | `more/product-returns` | `/api/provider/product-returns`  | PATCH (process returns)              |
| Shipping & Collection | `more/settings/shipping-config` | `/api/provider/settings/shipping-config` | PUT (save config)              |
| Walk-in Sale        | `more/walk-in-sale`| Sales/checkout APIs                  | POST (create sale)                   |

---

## Business

| Menu item        | Route                 | Data source / API (GET)                | Persistence                          |
|------------------|-----------------------|----------------------------------------|--------------------------------------|
| Catalogue        | `more/catalogue`      | `/api/provider/catalogue` or services | POST/PATCH/DELETE services/products  |
| Packages         | `more/packages`       | `/api/provider/packages`              | POST/PATCH/DELETE                    |
| Team             | `more/team`           | `/api/provider/team` / staff          | POST/PATCH/DELETE staff              |
| Staff Schedules  | `more/staff-schedule` | `/api/provider/staff-schedule`        | PATCH (shifts)                       |
| Time Clock       | `more/time-clock`     | `/api/provider/time-clock`            | POST (clock in/out)                  |
| Payroll          | `more/payroll`       | `/api/provider/payroll`               | Read-only or export                  |
| Finance          | `more/finance`       | `/api/provider/finance`               | Read-only                            |
| Invoices         | `more/invoices`      | `/api/provider/invoices`              | Read-only                            |
| Payouts          | `more/payouts`       | `/api/provider/payouts`               | Read-only / withdraw                 |
| Sales History    | `more/sales-history`  | `/api/provider/sales-history`         | Read-only                            |
| Gift Cards       | `more/gift-cards`    | `/api/provider/gift-cards`            | Create/sell/void                     |
| Transactions     | `more/transactions`   | `/api/provider/transactions`          | Read-only                            |
| Reports          | `more/reports`        | `/api/provider/reports/*`             | Read-only                            |
| Analytics        | `more/analytics`      | `/api/provider/analytics`             | Read-only                            |
| Activity         | `more/activity`       | `/api/provider/activity`              | Read-only                            |
| Gallery          | `more/gallery`       | `/api/provider/gallery`               | POST/DELETE (upload/delete)          |

---

## Engagement

| Menu item    | Route              | Data source / API (GET)           | Persistence                    |
|--------------|--------------------|-----------------------------------|--------------------------------|
| Reviews      | `more/reviews`     | `/api/provider/reviews`           | POST (respond)                 |
| Messages     | `more/messaging`   | `/api/provider/conversations`    | POST (send message)            |
| Marketing    | `more/marketing`   | `/api/provider/campaigns`        | POST/PATCH/DELETE campaigns    |
| Promotions   | `more/promotions`  | `/api/provider/promotions`       | POST/PATCH/DELETE              |
| Memberships  | `more/membership-plans` | `/api/provider/membership-plans` | POST/PATCH/DELETE        |
| Social Posts | `more/explore-posts`   | `/api/explore/posts/mine`    | POST/PATCH/DELETE              |
| Notifications| `more/notifications`  | Provider notification prefs     | PATCH (preferences)            |

---

## Settings (under More)

- **Settings** (`more/settings`) is the hub; each sub-screen (e.g. Business, Hours, Booking, Payments) uses:
  - **GET** `/api/provider/settings/<feature>` to load
  - **PATCH** or **PUT** to the same (or specific) endpoint to save
- If something “doesn’t persist”, check:
  1. The screen’s save handler (e.g. `saveSettings`, `useApiMutation`) and that it calls the correct PATCH/PUT URL.
  2. That the web API route for that URL exists and writes to the correct table/columns.
  3. That the provider app’s API client is using `APP_URL` and Bearer token (so the request is authenticated).

---

## Subscription, Billing, Rewards, Gamification

| Menu item   | Route                  | Data source / API (GET)              | Persistence        |
|-------------|------------------------|--------------------------------------|--------------------|
| Subscription| `more/subscription`    | `/api/provider/subscription`         | Read / upgrade flow|
| Billing History | `more/billing-history` | `/api/provider/billing-history`  | Read-only          |
| Rewards     | `more/rewards`         | `/api/provider/rewards`             | Read-only          |
| Badges & Gamification | `more/gamification` | `/api/provider/gamification`    | Read-only          |

---

## Quick checks when “data doesn’t persist or isn’t visible”

1. **Clients tab empty**  
   - Ensure you’re logged in and `EXPO_PUBLIC_APP_URL` points at the same app as the web (e.g. your Next.js backend).  
   - Clients come from saved clients + serviced (bookings) + conversations; if all three are empty, the list will be empty.  
   - All client APIs now accept Bearer auth (request passed into permission and provider lookup).

2. **Any More screen: list empty or edits not saving**  
   - In the provider app, open the screen and trigger load/save; check network (or logs) for the GET/PATCH/POST URL.  
   - In `docs/PROVIDER_MORE_MENU_DATA_AUDIT.md` (this file), find that menu item and its “Data source / API” and “Persistence” row.  
   - In the codebase, search for that API path (e.g. `useApi\('...')` or `useApiMutation`) in the screen file under `apps/provider/app/(app)/(tabs)/more/...` to see how it loads and saves.  
   - In `apps/web/src/app/api/provider/...` find the route and confirm it uses `requirePermission(..., request)` and `getProviderIdForUser(user.id, supabase)` (or equivalent) so mobile Bearer auth works.

3. **Settings sub-screens**  
   - Each settings screen usually has a single “Save” that PATCHes to an endpoint like `/api/provider/settings/<feature>`.  
   - If the value doesn’t persist, confirm the PATCH is sent (network tab), the route exists, and the handler updates the correct DB column and returns success.
