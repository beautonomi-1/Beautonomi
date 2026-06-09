# Provider dashboard & reports truthfulness audit

**Scope:** Mobile provider app dashboard (`apps/provider/app/(app)/(tabs)/dashboard.tsx`) and all 25 detail reports in `REPORT_DETAIL_REGISTRY`.  
**Canonical source of truth:** `public.finance_transactions` + semantics in `apps/web/src/lib/reports/provider-revenue-semantics.ts`.  
**Audit date:** 2026-06-05  
**Status:** Gaps identified below; fixes tracked in this repo pass.

## Accounting model (what should appear)

| Event | Ledger `transaction_type` | Recognized revenue? | Payout balance? | Dashboard / report surface |
|-------|---------------------------|---------------------|-----------------|----------------------------|
| Platform-held service payment | `provider_earnings` | Yes | Yes (if platform-held tender) | Revenue chips, earnings mix, payout earnings |
| Tip | `tip` | Yes | Yes (if platform-held) | Earnings mix, full-ledger reports |
| Travel fee | `travel_fee` | Yes | Yes (if platform-held) | Earnings mix, travel KPI (web) |
| Cancellation fee | `cancellation_fee` | Yes | Yes | Earnings mix |
| Walk-in add-on (provider-collected) | `walk_in_additional_charge` | Yes | No | Earnings mix |
| Refund (provider components) | `refund` | Reduces net | Clawback | Refunds report, earnings mix |
| Cash/Yoco booking (provider-collected) | Often no `provider_earnings` | No (ledger) | No | End-of-day, recorded takings |
| Retail POS | `product_orders` (no ledger) | No | No | Retail sales stat card |
| Platform subscription charge | `provider_subscription_payment` | Expense | **Must deduct** | Expenses (web), payout balance |
| Ads pre-pay | `provider_ads_payment` | Expense | **Must deduct** | Expenses (web), payout balance |
| Gift card / membership sale | `gift_card_sale`, `membership_sale` | Liability (not take-home) | No | Earnings mix lines |
| Discount contras | `promotion_discount`, `membership_discount`, `loyalty_discount` | No | No | Sales history only |

**Recognized revenue formula:** `provider_earnings + tip + travel_fee + cancellation_fee + walk_in_additional_charge` minus payout-affecting refund components.

---

## Mobile dashboard widget audit

API: `GET /api/provider/dashboard?include=insights` → `get-provider-dashboard.ts`.

| Widget / label | API field | Source tables / logic | Verdict | Notes |
|----------------|-----------|----------------------|---------|-------|
| Subtitle: appointments today | `appointments_today` | `bookings.scheduled_at` in TZ, `SCHEDULE_COUNT_STATUSES` | **Truthful** (if bookings not truncated) | Was capped at 5000 rows — fixed via pagination |
| Revenue earned (Today/Week/Month) | `revenue_today/week/month` | `finance_transactions` via `recognizedRevenueInRange` | **Truthful** | Ledger date in provider TZ; week/month are period-to-date |
| Appointments (period) | `appointments_today/week/month` | `bookings.scheduled_at` | **Truthful** (if not truncated) | Same booking cap fix |
| Retail sales (period) | `retail_sales_*` | `product_orders` via `getProviderRetailTakingsSummary` | **Truthful** | POS/collected only; subtitle states not platform payout |
| Available to withdraw | `available_balance` | `getAvailablePayoutBalance` | **Was wrong** | Subscription/ads not deducted — **fixed** |
| Pending Payments | `pending_payments_amount` | `bookings` unpaid (`payment_status` pending/partially_paid) | **Truthful** | Booked gross outstanding |
| Earnings mix (all-time) | `service_earnings_total`, etc. | `computeDashboardEarningsMix` on full ledger | **Truthful** | Not filtered by date chips |
| Recognized total | `recognized_earnings_total` | `recognizedRevenue()` | **Truthful** | |
| 7-day chart | `insights.weekly_revenue` | Ledger per civil day | **Truthful** | Empty-state fallback used device TZ — **fixed** |
| Booking Status: period column | `appointments_*` | Scheduled count in period | **Truthful** | Label shows period name |
| Booking Status: Pending/Confirmed/Completed | `pending/confirmed/completed_bookings` | All loaded bookings by status | **Mislabeled** | All-time counts beside period column — **labels fixed** |
| Top Services | `insights.top_services` | `buildServiceLedgerPerformance` | **Truthful** | Last 29 days completed |
| Performance: rating | `average_rating` | `providers.rating_average` | **Truthful** | |
| Performance: no-show rate | `no_show_rate` | Terminal bookings ratio | **Truthful** | |
| Performance: completed count | `completed_bookings` | All-time | **Redundant** | Duplicates booking status |
| Performance: completion rate | `completion_rate` | completed / terminal | **Missing on mobile** | API sends it; web shows — **fixed** |
| Upcoming bookings | `insights.upcoming_bookings` | `fetchUpcomingBookingsForDashboard` | **Truthful** | Client also filters future |
| Recent activity | `insights.recent_activity` | `buildProviderActivityFeed` | **Truthful** | 14-day merge: booking milestones + reschedules/confirmations/service-started events, CRM client adds, retail, full provider ledger slice (earnings, subscription, ads, gift card, membership, refunds, payouts), reviews. See `activity-feed-coverage.ts` + feed `basis.excluded`. |
| Gamification | `gamification.*` | `provider_points`, badges | **Truthful** | |
| Setup card | `/api/provider/setup-status` | Setup steps | **Truthful** | |
| Booking eligibility banner | `booking_eligibility` | `can_provider_create_booking` RPC | **Truthful** | |

### API fields fetched but not shown on mobile

| Field | Verdict |
|-------|---------|
| `revenue_growth`, `lifetime_revenue` | Omitted by design (web-only KPIs) |
| `completion_rate` | Was omitted — now shown |
| `cancelled_bookings`, `no_show_bookings` | Omitted (web shows full status grid) |
| `metrics_time_basis` | Omitted (earnings_mix footnote covers mix) |

---

## Report audit (25 registry reports)

Shared risk: **`getProviderRevenue()`** used a single PostgREST page (≤1000 rows) — **fixed** via `fetchAllLedgerPages`.

| Report | API | Primary source | Verdict | Action |
|--------|-----|----------------|---------|--------|
| Sales Summary | `sales/summary` | Ledger + recorded takings | **Was undercount** | Pagination fix |
| Revenue Trends | `sales/trends` | Ledger by `created_at` | **Was undercount** | Pagination fix |
| Booking Status | `bookings/status` | Bookings + ledger per status | **Was undercount** | Pagination fix |
| Cancellations | `bookings/cancellations` | Cancelled bookings + ledger | **Was undercount** | Pagination fix |
| No-Shows | `bookings/no-shows` | Bookings + ledger | **Mislabeled** | `lostRevenue` used earnings-only — **aligned to full ledger net** |
| Occupancy | `occupancy` | Staff schedules + bookings | **Truthful** | |
| Client Retention | `clients/retention` | Completed bookings | **Truthful** | Label explains overlap retention |
| Client Summary | `clients/summary` | Booked gross + ledger | **Mislabeled** | `averageLifetimeValue` = window booked gross — **documented** |
| Client LTV | `clients/lifetime-value` | All-time booked gross | **Mislabeled** | Title says LTV; basis is booked gross (documented) |
| End of Day | `end-of-day` | Recorded takings | **Truthful** | Not ledger revenue |
| Refunds | `payments/refunds` | `finance_transactions` refund rows | **Truthful** | |
| Payment Summary | `payments/summary` | Ledger + bookings + PT | **Was undercount** | Ledger pagination **fixed** |
| Payment Methods | `payments/methods` | PT + booking_payments | **Stub fields** | `failedCount`/`successRate` are compat placeholders — **documented** |
| Payout earnings (ledger) | `payments/payouts` | `provider_earnings` only | **Truthful but narrow** | Headline clarified; tips/travel excluded by design |
| Yoco Reconciliation | `payments/yoco-reconciliation` | `provider_yoco_payments` | **Truthful** | Amounts in cents |
| Product Sales | `products/sales` | booking_products + order items | **Truthful** | Mixed date axes documented |
| Inventory | `products/inventory` | `products` snapshot | **Truthful** | Provider-wide |
| Top Products | `products/top` | Same as product sales | **Truthful** | |
| Package Sales / Usage | `packages/*` | Bookings + packages | **Truthful** | Booked value only |
| Performance Dashboard | `business/dashboard` | Ledger + bookings | **Was undercount** | Pagination fix |
| Period Comparison | `business/comparison` | Ledger periods | **Was undercount** | Pagination fix |
| Staff Commission / Hours | `staff/*` | Ledger + bookings | **Was undercount** | Pagination fix |

---

## Confirmed bugs fixed in this pass

| ID | Issue | Fix |
|----|-------|-----|
| B1 | `getProviderRevenue()` single-page ledger query | `fetchAllLedgerPages` with date filters |
| B2 | Payout balance ignores subscription/ads charges | Add types to `.in()` filter in `available-payout-balance.ts` |
| B3 | Payment summary ledger truncation | `fetchAllLedgerPages` |
| B4 | Dashboard bookings `.limit(5000)` | `fetchAllPaged` for all booking rows |
| L1 | No-shows `lostRevenue` inconsistent ledger basis | Use `LEDGER_FULL_PROVIDER_NET_TYPES`; add `ledgerNetRecognized` alias |
| L2 | `averageLifetimeValue` misleading name | Document; prefer `averageBookedGross` in basis |
| L3 | Payouts headline naming | Clarify `totalPayoutAmount` = provider_earnings only in `basis` |
| L4 | Payment methods stub success stats | Mark deprecated in response `basis` |
| M1 | Chart zero-fallback device TZ | Use provider business TZ |
| M2 | `completion_rate` not shown | Add to Performance section |
| M3 | All-time vs period booking labels | Add "All-time" to status column labels |
| M4 | DashboardMetrics typing | Extended interface for fields consumed by UI |

---

## Production readiness checklist

- [x] Ledger pagination on dashboard (`fetchAllLedgerPages`, 50k cap)
- [x] Ledger pagination on `getProviderRevenue` (all report consumers)
- [x] Payout balance deducts platform-billed subscription/ads
- [x] Mobile dashboard labels match data basis
- [x] Report field semantics documented with `basisNote` / `reportBasis`
- [ ] Staging reconciliation against live Paystack/Yoco/bank payout data (requires deployment environment)
- [ ] Load test provider with >10k bookings / >50k ledger rows (safety caps)

## Related docs

- [PROVIDER_REPORTS_AUDIT.md](./PROVIDER_REPORTS_AUDIT.md)
- [docs/PROVIDER_REPORTS_SEMANTICS.md](../../../docs/PROVIDER_REPORTS_SEMANTICS.md)
