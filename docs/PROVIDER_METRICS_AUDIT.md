# Provider mobile app – metrics audit

**Date:** 2025-03-07  
**Scope:** All metrics and reports used by the provider mobile app; API alignment and location filtering.

---

## 1. Dashboard metrics

### 1.1 Main metrics (`GET /api/provider/dashboard`)

| Metric | Backend field | App usage | Location filter |
|--------|----------------|-----------|-----------------|
| Revenue (today/week/month) | `revenue_today`, `revenue_this_week`, `revenue_this_month` | Date range selector; StatCard | Yes (`location_id` query) |
| Appointments (today/week/month) | `appointments_today`, `appointments_this_week`, `appointments_this_month` | StatCard, subtitle | Yes |
| Available balance | `available_balance` | StatCard | Yes (earnings by location; payouts global) |
| Completion rate | `completion_rate` | StatCard | Yes (bookings count by location) |
| Booking counts | `confirmed_bookings`, `completed_bookings`, etc. | Bookings overview section | Yes |
| Rating & reviews | `average_rating`, `total_reviews` | Identity strip, Performance section | N/A (provider-level) |
| No-show rate | `no_show_rate` | Performance section | Yes |
| Gamification | `gamification` (points, badge, progress) | Rewards card | N/A (provider-level) |
| Provider profile | `provider_profile` (house calls, salon, distance) | Identity strip | N/A |

**Verdict:** Dashboard API and app types align. All booking/revenue metrics respect `location_id` when provided.

### 1.2 Supporting dashboard APIs

| Endpoint | Purpose | Location filter (before fix) | After fix |
|----------|---------|------------------------------|-----------|
| `GET /api/provider/reports/weekly-revenue?start_date=&end_date=` | 7-day revenue chart | No | **Yes** – filter `finance_transactions` by `booking_id` in location’s bookings |
| `GET /api/provider/reports/top-services?limit=5` | Top services list | No | **Yes** – filter `bookings` by `location_id` in join |
| `GET /api/provider/activity?limit=10` | Recent activity feed | No | **Yes** – bookings by `location_id`; payments filtered by those booking IDs (payouts still included) |

---

## 2. Reports (More → Reports)

| Screen | API | Response shape | App usage |
|--------|-----|----------------|------------|
| Reports index | `GET /api/provider/reports/bookings/summary` | `totalBookings`, `totalRevenue`, `averageBookingValue`, `statusBreakdown`, `topServices`, `dailyBookings` | Cards + top services list. Supports `location_id` (backend). |
| Business | `GET /api/provider/reports/business?period=` | `revenue`, `bookings`, `clients`, `staff`, `products` | StatCards, export. Timeout + Retry (15s). |
| Revenue | `GET /api/provider/reports/revenue?from=&to=` | `total_revenue`, `revenue_by_service`, `revenue_by_staff`, `daily_trend` | Chart, breakdowns. Timeout + Retry (15s). |
| Bookings | `GET /api/provider/reports/bookings?from=&to=` | Report data | List/analytics. |
| Clients | `GET /api/provider/reports/clients?from=&to=` | Client metrics | List/analytics. |
| Staff | `GET /api/provider/reports/staff?from=&to=` | Staff metrics | List/analytics. |
| Services | `GET /api/provider/reports/services?from=&to=` | Service metrics | List/analytics. |
| Products | `GET /api/provider/reports/products?from=&to=` | Product metrics | List/analytics. |
| Payments | `GET /api/provider/reports/payments?from=&to=` | Payment metrics | List/analytics. |
| Gift cards | `GET /api/provider/reports/gift-cards?period=` | Gift card metrics | List/analytics. |
| Packages | `GET /api/provider/reports/packages?period=` | Package metrics | List/analytics. |

All report routes exist under `apps/web/src/app/api/provider/reports/`. App uses `useApi` with correct paths and handles loading/error/timeout where added.

---

## 3. Sales tab

| Data | API | Response | App usage |
|------|-----|----------|-----------|
| Dashboard metrics | `GET /api/provider/dashboard` | Dashboard metrics (for summary) | Revenue/balance display |
| Sales list | `GET /api/provider/sales?limit=50&date_from=&date_to=&location_id=` | `{ data: Sale[], total }` | `salesResponse?.data`; date range and location filter. |
| Catalogue | `GET /api/provider/services?is_active=true` | Services | Cart / add service. |
| Products | `GET /api/provider/products?limit=200` | `{ products: [] }` or array | Products list. |
| Staff | `GET /api/provider/staff` or `?location_id=` | Staff list | Staff selector. |
| Clients | `GET /api/provider/clients` | Clients | Client selector. |
| Payment settings | `GET /api/provider/settings/payments` | Tax etc. | Cart totals. |

**Verdict:** Sales tab uses the correct endpoints and response shapes.

---

## 4. Activity screen (More → Activity)

- **API:** `GET /api/provider/dashboard` (same as main dashboard).
- **App:** Uses `DashboardData`; shows `gamification?.recent_transactions` and key stats (revenue, appointments, balance, rating).
- **Backend:** Dashboard returns `gamification.recent_transactions` (from `provider_point_transactions`).
- **Verdict:** Activity screen and dashboard API are aligned; no separate activity endpoint needed for this screen.

---

## 5. Fixes applied in this audit

1. **Weekly revenue report** – `location_id` support added. When present, revenue is restricted to transactions whose `booking_id` belongs to the selected location’s bookings.
2. **Top services report** – `location_id` support added. When present, the bookings join is filtered by `bookings.location_id`.
3. **Activity feed** – `location_id` support added. Bookings are filtered by location; payment transactions are limited to those with a `booking_id` in that set (payouts still included).

With these changes, when a provider selects a location on the dashboard, all metrics (main KPIs, 7-day chart, top services, and recent activity) are scoped to that location.

---

## 6. Summary

- **Dashboard:** Metrics, types, and location filtering are correct; supporting endpoints now respect `location_id`.
- **Reports:** All report screens use the correct APIs; business and revenue have timeout + Retry.
- **Sales:** Sales tab uses correct endpoints and response shapes including `sales.data`.
- **Activity:** Uses dashboard API and gamification data correctly.

No further metrics issues were found; the provider mobile app metrics work as intended with location-aware behaviour where applicable.
