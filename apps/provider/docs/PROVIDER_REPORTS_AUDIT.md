# Provider reports audit & hardening (A–J)

## Semantics reference

Per-endpoint metric, date axis, and ledger vs booked gross rules: [docs/PROVIDER_REPORTS_SEMANTICS.md](../../../docs/PROVIDER_REPORTS_SEMANTICS.md).

## A. Executive summary

- **Correctness:** Report APIs that bucketed by `toISOString().split("T")[0]` (UTC) now use **`reportDateKey(..., providerTimezone)`** for booking summary daily counts, cancellations daily breakdown, and refund daily breakdown so charts align with provider civil dates and with `revenueByDate` keys from `getProviderRevenue`.
- **Location scoping:** `cancellation_fee` rows in **revenue**, **end-of-day** (tips + cancellation fees), and **business overview** (refunds, tips, cancellation fees, add-on charges) now go through **`filterLedgerRowsForLocation` / `filterProductOrdersForLocation`** where a branch is selected. **Refunds** report uses the same ledger filter and includes **product_order_id**-linked rows, not only bookings.
- **Product:** **Provider dashboard** links to non-existent flat routes were fixed to real nested report URLs. **Payouts** copy everywhere clarifies **ledger / platform-held earnings**, not bank payout history. **Mobile + web** catalogs were relabeled and **Product Sales** was moved under **Product & inventory** on mobile to reduce duplicate “surfaces.”
- **Tests:** Vitest for `reportDateKey` / `eachReportDateKey`, route-level provider report sign-off coverage, and Jest for `reportDateRanges` plus **catalog ↔ `REPORT_DETAIL_REGISTRY` parity**.
- **Final sign-off pass:** Production-like reconciliation was completed against the code-level accounting sources and route behavior. Live Yoco / bank payout / Supabase production datasets were not available locally, so external reconciliation remains a deployment/staging acceptance item, not a code blocker.

## B. Report inventory (surfaces → API)

| Area | Mobile | Web hub route | Primary API(s) | Notes |
|------|--------|----------------|----------------|-------|
| Sales & revenue | Native + detail | `/provider/reports/sales/*` | `sales/summary`, `sales/trends`, `sales/services` | Revenue uses ledger `created_at`; trends use TZ keys |
| Staff | Native + detail | `/provider/reports/staff/*` | `staff/performance`, `staff/commission`, `staff/hours` | |
| Bookings | Native + detail | `/provider/reports/bookings/*`, `occupancy` | `bookings/summary`, `status`, `cancellations`, `no-shows` | Summary mixes scheduled counts + ledger revenue by day |
| Clients | Native + detail | `/provider/reports/clients/*` | `clients/summary`, `retention`, `new`, `lifetime-value` | |
| Payments | Native + detail | `/provider/reports/payments/*`, `end-of-day` | `payments/summary`, `refunds`, `methods`, `payouts`, `end-of-day` | EOD = cash-register; payouts = ledger earnings |
| Product & inventory | Native + detail | `/provider/reports/products/*` | `products/sales`, `inventory`, `top` | |
| Gift cards | Native | `/provider/reports/gift-cards/*` | gift card report APIs | |
| Packages | Native + detail | `/provider/reports/packages/*` | `packages/sales`, `packages/usage` | |
| Business | Native + detail | `/provider/reports/business/*` | `business/overview`, `dashboard`, `comparison` | |
| More | Analytics, Activity | — | N/A | Exploratory, not finance export |

*Export support:* follows each report page’s CSV helpers where present (`export` modules under `apps/web/src/app/provider/reports/…`).

## C. Semantics & accounting alignment

- **Revenue / sales:** `getProviderRevenue` is ledger-first (`finance_transactions`) with optional `DASHBOARD_REVENUE_TRANSACTION_TYPES` and **provider timezone** for `revenueByDate` keys.
- **Cancellation fees:** Added to “inclusive” revenue in **revenue** report; scoped by **booking / product order** links when a location filter is set.
- **Payouts page & API:** Terminology updated to **payout earnings (ledger)** — represents **booked / earnable value in the ledger**, not necessarily money paid to a bank account.
- **End of day:** Described in API as **cash-register style** (booking_payments, sales, walk-in `product_orders`, plus scoped tips/cancellation fees). Not the same as ledger revenue totals.

## D. Timezone & date logic

- **Web APIs:** `reportDateRangeFromParams` + `dateRangeBoundsUtc` define inclusive civil ranges in the provider’s IANA TZ.
- **Day keys:** `reportDateKey` uses `formatDateYmd` in that TZ (same basis as `revenue-helpers` for ledger daily maps).
- **Mobile presets:** `getReportDateRange` in `apps/provider/src/lib/reportDateRanges.ts` uses **business TZ** and invalid-TZ fallback aligned with web `resolveTz` behavior.

## E. Location scoping

- **Bookings** tables: `location_id` on `bookings` / `provider_locations` filters.
- **Ledger:** No `location_id` on `finance_transactions` — scoping uses **`filterLedgerRowsForLocation`** (bookings + product orders with collection / fulfillment rules).
- **Walk-in POS orders:** End-of-day walk-in `product_orders` rows filtered with **`filterProductOrdersForLocation`** when a branch is selected.

*Caveat:* Ledger rows with **no** `booking_id` and **no** `product_order_id` are **excluded** when a location is selected (cannot attribute to a branch).

## F. App vs web parity

- **Hub labels:** “Sales & revenue,” “Payments,” “Product & inventory,” “Packages & memberships,” “Business overview” aligned between mobile `reportCatalog.tsx` and web `reports/page.tsx`.
- **Payout naming:** Mobile catalog, `REPORT_DETAIL_REGISTRY`, and web hub + payouts report page use **Payout earnings (ledger)**.
- **Intentional differences:** Mobile keeps native shortcuts (e.g. Staff, Bookings tabs); web splits gift card sales/redemptions into two links.

## G. Catalog consolidation (implemented)

- Mobile **Sales** duplicate **Product Sales** removed; **Product Sales** detail lives under **Product & inventory**.
- **Payments:** clearer separation of Payment summary vs End of day vs **Payout earnings (ledger)**.
- **Business:** copy distinguishes native overview vs web-style Performance dashboard vs in-app Revenue.

## H. Regression tests added

| Location | What |
|----------|------|
| `apps/web/src/lib/reports/__tests__/provider-report-utils.test.ts` | TZ day bucketing vs UTC; inclusive date keys; unattributed ledger-row summary under location filters |
| `apps/web/src/app/api/provider/reports/__tests__/provider-report-routes.signoff.test.ts` | Route-level behavior for bookings summary, cancellations, refunds, end-of-day, payment summary, revenue, and payout earnings using booking + product-order + unattributed ledger scenarios |
| `apps/provider/__tests__/reportCatalogRegistryParity.test.ts` | Every `detail` catalog `reportId` ∈ `REPORT_DETAIL_REGISTRY` |
| `apps/provider/__tests__/reportDateRanges.test.ts` | TZ resolver + `today` range shape |

## I. Remaining gaps resolved / closed

| Previous gap | Final handling |
|--------------|----------------|
| Production accounting reconciliation against live Yoco / bank payout / live Supabase shapes was not run | Code-level reconciliation was completed against the report source-of-truth tables: `finance_transactions`, `booking_payments`, `payment_transactions`, `bookings`, `product_orders`, gift-card redemptions, and package booking lines. Bank/Yoco/live data comparison remains a staging acceptance check because those systems are not locally available. |
| Full route integration tests were not added | Added route-level Vitest coverage for high-risk report behavior: provider-TZ date ranges, timezone boundary bucketing, branch location filters, booking + product-order mixed scenarios, ledger payout wording/semantics, and unattributed provider-level ledger rows. |
| Gift-card-only or platform-only ledger rows can undercount branch filters when they lack booking/order linkage | Added `summarizeLedgerLocationAttribution` and response-level `locationAttribution` metadata/notes for payment summary, refunds, payments, revenue, payout earnings, end-of-day, and business overview. Branch totals still exclude rows that cannot truthfully be attributed, but the response now explicitly reports excluded unattributed rows instead of silently implying they belong to the branch. |

## J. Remaining blockers / not exercised here

- **External reconciliation:** Live Yoco settlement exports, bank payout files, and production Supabase data were not available in this local pass. Final finance acceptance should compare one known provider against those external systems.
- **RLS / DB integration:** Route tests run against mocked Supabase query behavior, not a disposable Supabase database with RLS. They exercise real route aggregation/control flow but not Postgres policies.
- **Unattributed branch finance:** Rows with neither `booking_id` nor `product_order_id` remain provider-level only. This is intentional: allocating by heuristic would be less truthful than excluding them from branch totals and exposing `locationAttribution`.

## K. Final provider report sign-off matrix

| Report | Intended meaning | Final API source | Semantics | App/web parity | Ready |
|--------|------------------|------------------|-----------|----------------|-------|
| Sales | Sales & revenue overview | `sales/summary` | Booking/service mix + ledger revenue | Aligned labels | Yes |
| Service | Service performance | `sales/services`, native service report | Service-level booked / ledger revenue allocation | Intent aligned | Yes |
| Product | Retail product sales | `products/sales`, `products` | Booking product add-ons + standalone paid product orders | Folded under Product & inventory | Yes |
| Revenue | Ledger revenue trend | `revenue`, `sales/trends` | `finance_transactions.created_at`, provider-TZ daily keys | App/web wording clarified | Yes |
| Staff | Staff productivity | `staff/performance` | Booking services by staff | App native + web | Yes |
| Commission | Staff commission | `staff/commission` | Staff commission breakdown | Detail parity via registry | Yes |
| Hours | Hours & attendance | `staff/hours` | Worked hours / attendance | Detail parity via registry | Yes |
| Booking Summary | Booking volume/status/source | `bookings/summary` | Scheduled-date counts + ledger revenue by provider-TZ day | Native + web | Yes |
| Booking Status | Booking status mix | `bookings/status` | Status counts by scheduled range | Detail parity | Yes |
| Occupancy | Capacity/utilization | `occupancy` | Booking/staff/time utilization | Detail parity | Yes |
| Cancellations | Cancelled bookings | `bookings/cancellations` | Exact counts by scheduled range; daily cancelled-at/scheduled-at TZ key | Detail parity | Yes |
| No-Shows | Missed appointments | `bookings/no-shows` | No-show counts and potential lost revenue | Detail parity | Yes |
| Client Summary | Client base | `clients/summary` | Client counts/spend by booking range | Native + web | Yes |
| Client Retention | Repeat behavior | `clients/retention` | Completed/confirmed repeat visit rates | Detail parity | Yes |
| New Clients | First-visit clients | `clients/new` | First confirmed/completed bookings; location means first at branch | Detail parity | Yes |
| Lifetime Value | Client value | `clients/lifetime-value` | Completed booking value by client | Detail parity | Yes |
| Payment Summary | Payment/accounting summary | `payments/summary` | Ledger settlement plus booking/payment transaction cross-check | Native + web | Yes |
| End of Day | Cash-register daily takings | `end-of-day` | Booking payments, sales, walk-in product orders, scoped tips/cancellation fees | Detail parity | Yes |
| Refunds | Refund ledger impact | `payments/refunds` | Refund gross + provider earnings reversal impact, provider-TZ daily keys | Detail parity | Yes |
| Payment Methods | Method split | `payments/methods`, `payments` | Payment methods from booking payments / ledger where available | Detail parity | Yes |
| Payouts | Payout earnings (ledger) | `payments/payouts` | Platform-held provider earnings, not bank transfer history | Wording aligned | Yes |
| YOC / Yoco | Terminal reconciliation | `payments/yoco-reconciliation` | Yoco terminal sync/debugging | Web/detail | Conditional: requires live Yoco validation |
| Product & Inventory | Product hub | `products`, `inventory`, `top` | Product sales + stock + top sellers | Consolidated | Yes |
| Inventory | Stock levels | `products/inventory` | Inventory/SKU levels | Detail parity | Yes |
| Top Products | Best sellers | `products/top` | Booking products + standalone product orders | Detail parity | Yes |
| Gift Card Report | Gift-card redemption at provider | `gift-cards/sales`, `gift-cards/redemptions` | Platform sells gift cards; provider report shows redemptions | Web split, mobile combined | Yes |
| Package Sales | Package booked value | `packages/sales` | Package/service line prices, excludes fees/tips | Detail parity | Yes |
| Package Usage | Package redemption/balance | `packages/usage` | Redemptions and balances | Detail parity | Yes |
| Packages | Package overview | `packages`, native packages | Combined package analytics | Mobile native + web details | Yes |
| Business Overview | Operational KPIs | `business/overview` | Ledger revenue + booking stats + scoped extras/refunds | Native + web | Yes |
| Performance | KPI dashboard | `business/dashboard` | Snapshot KPIs | Clarified vs Analytics/Activity | Yes |
| Period Comparison | Period deltas | `business/comparison` | Current vs previous periods | Detail parity | Yes |
| Revenue Overview | In-app revenue overview | Native route + `revenue`/sales APIs | App revenue trends complement web reports | Intentional app view | Yes |
| Analytics | Exploratory charts | Native analytics route | Performance/trend UI, not finance export | Explicitly separate | Yes |
| Activity | Recent timeline | Native activity route | Operational timeline, not finance export | Explicitly separate | Yes |

## L. Readiness checklist (manual)

- [ ] Compare **booking summary** daily chart counts vs **scheduled_at** list for a known day near UTC midnight (provider in non-UTC TZ).
- [ ] With a **branch selected**, verify **revenue** cancellation fees + **refunds** + **business overview** net rollups vs unscoped totals.
- [ ] **End of day** for one calendar day: booking payments + walk-in products + tips/cancellation fees vs POS expectations.
- [ ] **Payout earnings** report: confirm internal stakeholders accept **ledger** definition vs finance **bank payout** export.
- [ ] Dashboard links: **Gift cards → sales**, **Packages → sales**, **Bookings → summary**, **Month card → business overview**.

## M. Single source of truth: provider revenue semantics (2026-06)

Previously the dashboard, business overview, payment summary and the legacy payments
route each computed "revenue" / "net" differently, so the same period showed different
numbers. They now all consume **one** canonical module:
[`apps/web/src/lib/reports/provider-revenue-semantics.ts`](../../web/src/lib/reports/provider-revenue-semantics.ts).

### Ledger posting invariants (verified against the writers)

| `transaction_type` | Provider take-home column | Relationship | In recognized revenue? |
|--------------------|---------------------------|--------------|------------------------|
| `provider_earnings` | `net` (== `amount`) | Post-commission service take. **Excludes** tip/travel/cancellation (separate rows). Also carries additional-charge take + product/membership earnings. Negative rows = legacy refund reversals. | **Yes** |
| `tip` | `net` (== `amount`) | Standalone pass-through owed to provider. | **Yes** |
| `travel_fee` | `net` (== `amount`) | Standalone; **not** embedded in `provider_earnings` (the old "net=0 / included in earnings" comment was stale). | **Yes** |
| `cancellation_fee` | `net` (== `amount`) | Provider-retained late-cancel income. | **Yes** |
| `walk_in_additional_charge` | `net` (== `amount`) | Provider-collected in-person add-on (cash-in-hand). | **Yes** |
| `additional_charge_payment` | `net` = **platform commission** | Platform's leg of an online additional charge. | No |
| `additional_charge` | (in `payment_transactions`) | Gateway gross record, not a `finance_transactions` provider row. | No |
| `payment` / `wallet_payment` / `gift_card_payment` | tender legs | Customer funds settled, not provider take. | No |
| `platform_fee` / `service_fee` / `tax` | platform / statutory | Not provider money. | No |
| `refund` (components) | `net` (negative) | Per-component (migrations 652/654). Only **provider-money** components deduct (`isProviderEarningsRefundComponent`). | Deduction |

Because each recognized type posts as its own row with `amount === net`, summing each
type's `net` counts every economic event **exactly once** — there is no travel/tip
double-count. Refunds post **either** as component `refund` rows **or** a legacy negative
`provider_earnings` reversal (never both for one refund), so netting negatives into
`provider_earnings` while subtracting provider-component `refund` rows does not
double-count.

### Canonical definitions

- **Recognized revenue** = `provider_earnings + tip + travel_fee + cancellation_fee + walk_in_additional_charge` (net per row). `recognizedRevenue(rows)`.
- **Provider net after refunds** = recognized revenue − Σ |provider-money `refund` components|. `providerNetAfterRefunds(rows)`.
- **Service earnings** = `provider_earnings` only (a labelled subset of recognized). `providerServiceEarnings(rows)`.

### Surfaces repointed

- **Dashboard** (`get-provider-dashboard.ts`): `recognizedRevenueTotal` / `totalRevenue` via `recognizedRevenue`.
- **Business overview** (`business/overview/route.ts`): `totalRevenue` = recognized, `netRevenue` = net after refunds, plus new `serviceEarnings`, `travelFeesTotal`, `walkInAdditionalChargesTotal`; `additionalChargesTotal` removed (it conflated the platform commission leg).
- **Payment summary** (`payments/summary/route.ts`): `providerNetActivity` = `providerNetAfterRefunds` (now includes walk-in add-ons).
- **Legacy `reports/payments/route.ts`**: deleted its divergent `net_revenue` formula; re-exports `payments/summary`'s `GET`.

### Undercount cap fix

The dashboard previously fetched `finance_transactions` with `.limit(8000)` and **no date
filter**, silently dropping rows for high-volume providers. It now uses the shared
[`fetchAllLedgerPages`](../../web/src/lib/reports/fetch-all-ledger-pages.ts) (offset
pagination, bounded by `MAX_FINANCE_TRANSACTIONS`), the same helper the finance route uses.

### Tests

| Location | What |
|----------|------|
| `apps/web/src/lib/reports/__tests__/provider-revenue-semantics.test.ts` | Single-count travel/tip, refund-component signs, legacy-reversal vs modern-refund non-double-count, breakdown reconciliation |
| `apps/web/src/lib/reports/__tests__/provider-revenue-reconciliation.test.ts` | Dashboard == business overview == payment summary headline for one fixture; >8000-row sum has no cap |
| `apps/web/src/lib/reports/__tests__/fetch-all-ledger-pages.test.ts` | Pagination fetches all rows (>8000), stops on short page, respects max bound, propagates errors |

### Mobile fixes (same pass)

- **Team totals** (`team-totals.tsx`): day/week navigation now anchors to the **provider business timezone** (was device-local, wrong near midnight); money uses shared `formatCurrency`.
- **Transactions feed** (`transactions.tsx`): summary cards (in/out/net) now compute from the **filtered** list so they match the visible rows.
- **Business overview** (`reports/business.tsx`): headline relabeled **Recognized revenue** with a component breakdown; the "Client retention" shortcut (which opens the Clients report) relabeled **Clients**.
- **Transactions hub** (`transactions-hub.tsx`): money uses shared `formatCurrency`.

> Note: the provider finance ledger feed (`/api/provider/finance` `transactions[]`) keeps
> its richer per-row shape (`net`/`fees`/`commission`/`date`/`currency`) because the web
> finance page renders those columns; it stays sign-aligned with the shared mapper. The
> `/api/provider/transactions` GET and CSV export share `providerTransactionsPeriodStart`
> so their default windows no longer drift (was 29 vs 30 days).
