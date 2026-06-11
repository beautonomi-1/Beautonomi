# Provider reports semantics matrix

Authoritative accounting rules: [PAYMENT_ACCOUNTING_CONTRACT.md](./PAYMENT_ACCOUNTING_CONTRACT.md).

Shared constants: `apps/web/src/lib/reports/constants.ts`.

## Headline revenue (2026-06)

**Headline "what you earned"** on dashboard, analytics, business overview, sales summary, revenue report, and weekly revenue:

```text
recognized_revenue_net = providerNetAfterRefunds
  = sum(provider_earnings + tip + travel_fee + cancellation_fee + walk_in_additional_charge)
    − provider refund clawbacks
```

**Sub-lines (never headline):**

- `service_earnings` = `provider_earnings` only (`DASHBOARD_REVENUE_TRANSACTION_TYPES`)
- `ledger_full` = `provider_earnings + travel_fee + tip` for per-booking allocation in some staff/sales splits

Cancellation/refund reports always use net-after-refunds per booking. Analytics booking counts use `scheduled_at` (aligned with booking reports).

## Metric families

| Family | Source | Typical date field | UI label hint |
|--------|--------|-------------------|---------------|
| Ledger earnings (headline) | `getProviderNetAfterRefunds*` / `provider-revenue-semantics` | `created_at` | "Recognized revenue (net)" |
| Service earnings (sub-line) | `getProviderRevenue` with `provider_earnings` only | `created_at` | "Service earnings" |
| Booked gross | `bookings.total_amount`, line `price` | `scheduled_at` or `created_at` (stated per report) | "Booked value" / "Appointment total" |
| Recorded takings | `booking_payments`, `sales`, walk-in `product_orders` | capture timestamps | "Recorded takings" / "Till total" |
| Sales history row | `provider-sales-history.ts` | ledger `created_at` in range | Per-sale gross vs `provider_net` |

**Do not compare** ledger earnings to booked gross without reading the report `basis` / `reportBasis` field.

## API endpoints (provider app surfaces)

| Endpoint | Primary metrics | Date axis | Ledger? |
|----------|-----------------|-----------|---------|
| `GET /api/provider/analytics` | `revenue.*` = recognized net; `service_earnings` sub-line | Ledger: `created_at`. Bookings: `scheduled_at` | Yes |
| `GET /api/provider/sales-history` | `gross_total`, `provider_net`, breakdown | Ledger `created_at` | Yes |
| `GET /api/provider/reports/revenue` | `total_revenue` = recognized net | Ledger `created_at` | Yes |
| `GET /api/provider/reports/sales/summary` | Recognized net + recorded takings | Mixed (see route `basis`) | Yes + till |
| `GET /api/provider/reports/sales/services` | Ledger allocated by line share | `scheduled_at` + ledger window | Yes |
| `GET /api/provider/reports/top-services` | Ledger allocated by offering (completed only) | `scheduled_at` + ledger `created_at` window | Yes |
| `GET /api/provider/staff/totals` | `revenue` = allocated `provider_earnings` | `scheduled_at` appointments + ledger window | Yes |
| `GET /api/provider/reports/bookings/*` | Counts by status; revenue uses ledger where noted | `scheduled_at` | Mixed |
| `GET /api/provider/reports/clients/*` | `booked_gross_spend` + `ledger_earnings` | `scheduled_at` (window) | Gross + ledger |
| `GET /api/provider/reports/payments/*` | Settlement, refunds, methods | Ledger / capture | Yes |
| `GET /api/provider/reports/end-of-day` | Till totals | Capture date | Till |
| `GET /api/provider/reports/staff/*` | Ledger allocation, commission, hours | `scheduled_at` / ledger | Mixed |
| `GET /api/provider/staff/totals` | Revenue = `provider_earnings` allocated | `scheduled_at` + ledger | Yes |
| `GET /api/provider/finance/vat-reports` | VAT collected | Tax period | VAT rules |

## Sales history reconciliation

Per booking row (no refund):

```text
gross_total === provider_net + commission + platform_fee + tax + discount_contra
```

- `discount_contra` = sum of absolute `net` on `promotion_discount`, `membership_discount`, `loyalty_discount`, `loyalty_redemption` rows (contra-revenue; does not reduce `provider_net`).
- `walk_in_additional_charge` is included in `provider_net`.

## Location scoping

When `location_id` is set, ledger rows without `booking_id` / `product_order_id` are excluded; responses may include `locationAttribution.excludedUnattributedRows`.

## Related docs

- [apps/provider/docs/PROVIDER_REPORTS_AUDIT.md](../apps/provider/docs/PROVIDER_REPORTS_AUDIT.md) — hardening history and sign-off matrix.
