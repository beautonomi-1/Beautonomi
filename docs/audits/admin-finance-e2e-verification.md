# Admin Finance E2E Verification Report

**Date:** 2026-07-28  
**Scope:** `/admin/finance` metrics, periods, filters, accounting integration  
**Method:** Automated tests (58 + 11 new), codebase trace, API contract review  

---

## Test results

| Suite | Result |
|-------|--------|
| Core aggregation (`aggregate-finance-ledger-rows`, scenarios, gateway breakdown, financial-reporting-audit, fee-reconciliation, fee-adjustment) | **52/52 passed** |
| `finance-ledger-tenant` (range, prior period, filter mapping) | **10/10 passed** |
| `GET /api/admin/finance/summary` route integration | **5/5 passed** |
| `GET /api/admin/finance/transactions` route integration | **3/3 passed** |
| `adminQueryKeys.finance` | **6/6 passed** |
| `FinanceOverviewPage` filter/API smoke | **6/6 passed** |

---

## Filter matrix (verified)

| Control | URL param | Summary API | Transactions API | CSV export |
|---------|-----------|-------------|------------------|------------|
| Default MTD | (none) | UTC month 1 → now | UTC month 1 → now | Same |
| Start date | `start_date` | Passed | Passed | Passed |
| End date | `end_date` | Passed | Passed | Passed |
| Type: all | (omit) | N/A (full rollup) | All types | All types |
| Type: payment | `type=payment` | N/A | 5 tender types | `transaction_type=payment` |
| Type: refund | `type=refund` | N/A | `refund` only | Same |
| Type: payout | `type=payout` | N/A | `payout` only | Same |
| Type: fee | `type=fee` | N/A | platform_fee + service_fee | Same |
| Pagination | `page` | N/A | In-memory slice, limit 50 | N/A |
| Provider scope | `provider_id` | Passed | Passed | Passed |

**Behavior:** Summary and transactions scope to provider when `provider_id` is set. Type filter affects transactions table and export only. Changing dates, type, or provider resets `page` via `patchParams(..., true)`.

---

## Metric mapping: UI → API → ledger

### Headline metrics (new)

| UI label | API field | Ledger / source |
|----------|-----------|-----------------|
| Settled service GMV (+ trend) | `service_collected_gross`, `gmv_growth` | `aggregateFinanceLedgerRows.service_collected_gross` |
| Settled service (net) | `service_collected_net` | agg net after service gateway fees |
| Platform commission (net) | `platform_commission_net` / `platform_take_net` | agg |
| Provider net activity | `provider_net_activity` | recognized gross − refund clawback |

### Platform earnings panel

| UI label | API field | agg bucket |
|----------|-----------|------------|
| Booking commission (net) | `platform_revenue.booking_commission` | `platform_take_net` |
| Customer-paid platform fees | `platform_revenue.customer_paid_platform_fees` | `service_fee_revenue` |
| Subscriptions (net) | `platform_revenue.subscriptions` | `subscription_net` |
| Ads (net) | `platform_revenue.ads` | `ads_net` |
| Marketing credits (net) | `platform_revenue.marketing_credits` | `marketing_credit_net` |
| Ecommerce fees detail | `platform_revenue.ecommerce_fees_detail` | `ecommerce_platform_fees` |
| Platform refund contra | `platform_refund_impact` | `platform_refund_contra` |
| Referral payouts | `referral_payouts` | `wallet_transactions` query |
| Net platform earnings | `platform_revenue.total` | sum of revenue streams |

### Provider earnings panel

| UI label | API field | agg bucket |
|----------|-----------|------------|
| Provider service earnings | `provider_revenue.provider_earnings` | `provider_earnings_net` |
| Cancellation fees retained | `provider_revenue.cancellation_fees` | `cancellation_fees_retained` |
| Tips / travel / walk-in | respective `provider_revenue.*` | `tips_gross`, `travel_fees`, `walk_in_additional_charges` |
| Refund clawback / payouts | deductions | `provider_refund_net_impact`, `payouts_paid_total` |

### Gateway fees breakdown

| UI label | API field | agg bucket |
|----------|-----------|------------|
| Booking & add-on | `gateway_fees_breakdown.services` | `gateway_fees_services` |
| Terminal / subscription / ads / etc. | breakdown fields | matching `*_gateway_fees` |
| Total | `gateway_fees_breakdown.total` | `gatewayFeesTotalFromAggregate` |

### Deductions & other flows

| UI label | API field | Source |
|----------|-----------|--------|
| Refunds (gross) | `refunds_gross` | agg |
| Gift card sales | `gift_card_sales` | agg |
| Wallet top-ups cash collected | `liabilities.wallet_topups_cash_collected` | `wallet_topups.paid_at` |
| Gift card outstanding liability | `liabilities.gift_card_outstanding` | point-in-time `gift_cards.balance` |
| Referral payouts | `referral_payouts` | wallet_transactions |

### Reconciliation controls

| UI label | API path | Source |
|----------|----------|--------|
| Ledger vs bookings GMV | `reconciliation.checks.ledger_vs_bookings_gmv` | agg vs `computeAlignedBookingsGmv` |
| Gateway fee anomalies | `reconciliation.checks.gateway_fee_capture_anomalies` | Paystack row scan |
| Negative payout balances | `reconciliation.checks.negative_provider_payout_balances` | provider balance scan |
| Refund burden / platform net | respective checks | computed in summary route |

### Metric contracts & glossary

| UI section | API field | Notes |
|------------|-----------|-------|
| Metric contracts | `metrics_meta.contracts` | Version `2026.07.05` |
| Admin glossary | `language_context.glossary` | Platform admin audience |

---

## Fixes applied during verification

1. **UTC prior-period for GMV growth** — `computeAdminFinancePreviousPeriodRange()` uses UTC calendar month bounds (aligned with MTD default).
2. **Headline GMV card** — `Settled service GMV` now displays `gmv_growth` trend on the finance page.
3. **Period label formatting** — Shows `YYYY-MM-DD` instead of raw ISO timestamps.
4. **Summary API response shape** — `metrics_meta` and `language_context` were incorrectly nested under `reconciliation`; moved to top-level `data` (Metric contracts panel was empty in prod).
5. **Shared filter helper** — `financeTransactionTypesForAdminFilter()` deduplicated between transactions and export routes.
6. **Route integration tests** — Added for summary and transactions endpoints.
7. **FinanceOverviewPage smoke test** — Static wiring checks for URL params and API calls.

---

## Enterprise-grade assessment

### Strengths

- Single aggregation source (`aggregateFinanceLedgerRows`) for admin finance and dashboard
- Documented metric contracts with version stamp
- Built-in reconciliation controls (GMV variance, fee anomalies, negative balances)
- Period locking at DB + app layer
- Split-refund aware accounting
- Tenant-scoped queries and RBAC
- Nightly ledger audit script

### Remaining gaps (non-blocking)

| Priority | Gap | Status |
|----------|-----|--------|
| Medium | Metric contracts declare tenant TZ; filters use UTC | Documented |
| Medium | Gift card liability is point-in-time, not period roll-forward in UI | Open |
| Medium | Operational metrics vs GL RPC partial cutover | Open |

**Resolved in follow-up:** Trial balance admin UI (`/admin/trial-balance`), `platform_cash_position` in reconciliation panel, `provider_id` filter wired in finance page UI.

**Verdict:** Calculation engine and reconciliation design are **production-grade**. Verification surface is now materially improved with route tests and a fixed metrics_meta response.

---

## Manual prod checklist (when signed in)

1. Load `/admin/finance` — Headline metrics show GMV with % trend vs prior UTC month
2. Metric contracts panel renders (version + formulas)
3. Set last month dates — summary and transactions update
4. Filter `type=refund` — table only; summary unchanged
5. Export CSV — respects dates and type
6. `/admin/period-locks` and `/admin/wallet-reconciliation` load
7. Dashboard platform revenue matches finance total for same period
