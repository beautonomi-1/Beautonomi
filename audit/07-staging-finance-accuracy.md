# Staging finance accuracy audit

Read-only check of staging Supabase `byfzhyqvtbasxptxdupf`, frozen at **2026-11-16 08:55:00 UTC**. Every statement was a `SELECT`. Nothing on staging was inserted, updated, or repaired.

How to re-run: `node scripts/audit/staging-finance-accuracy.mjs`. Queries live in `scripts/audit/staging-finance-accuracy.sql`. The run writes `scripts/audit/out/staging-finance-accuracy.json` and `.csv`. The nightly script `scripts/prod/audit-finance-ledger.mjs` was also run against staging and printed `OK — ledger invariants hold`.

Money tolerance is R0.01 (one cent). Currency on every ledger row is ZAR.

## 1. What was on staging

| Table | Rows at freeze |
|---|---|
| tenants | 2 |
| bookings | 7 (1 customer) |
| booking_payments | 3, all completed Paystack |
| booking_refunds | 2, both completed |
| finance_transactions | 20 (15 Nov 2026 10:53 UTC through 16 Nov 2026 08:28 UTC) |
| payment_transactions | 4 (1 success, 2 refunded, 1 failed) |
| wallet_topups | 1 paid, R100 |
| wallet_transactions | 3 |
| user_wallets | 3 |
| provider_subscriptions | 3, all `active`, none with `last_payment_date` |
| product_orders, group_bookings, booking_participants, custom_offers, custom_requests, gift_cards, membership_orders, terminal_orders, payouts | 0 |

Migrations `10105`, `10116`, `10124`, `10125`, `10139`, `10141`, `10145`, and `10180` are applied. `booking_status` includes pending, confirmed, in_progress, completed, cancelled, no_show, waiting, checked_in, pending_payment. `payment_status` includes pending, paid, failed, refunded, partially_refunded, partially_paid. `platform_settings.timezone` is null, so the dashboard falls back to UTC.

Booking state that actually has money:

| Status | Payment | Bookings | Quoted | Paid | Refunded |
|---|---|---|---|---|---|
| cancelled | failed | 1 | 180.00 | 0 | 0 |
| cancelled | pending | 3 | 480.00 | 0 | 0 |
| cancelled | refunded | 2 | 315.00 | 315.00 | 315.00 |
| completed | paid | 1 | 187.50 | 187.50 | 0 |

Paid bookings: `3571f182-515d-4216-965b-7121347a1fdb` (completed, R187.50), `74d63648-4e0e-4940-a722-540f375d08b2` (refunded, R120), `934f6599-99d6-4bb0-b7e8-62de0298409b` (refunded, R195).

## 2. Check results

50 checks. **34 pass, 2 fail, 14 vacuous.** Vacuous means the source table is empty, so a zero count does not prove that flow. Full rows are in the CSV.

Passing checks that had data to look at: duplicate payment legs, completed refunds without a ledger row, shadow general ledger (debits R1,067.50 = credits R1,067.50, 0 missing, 0 imbalanced), online payments missing a ledger leg, provider earnings missing, component drift on fully refunded bookings, orphan refund rows, VAT charged without registration, deposit tax leak, overcharged tax-inclusive bookings, null `tenant_id`, ledger tenant differing from the booking, exactly one `payment` leg per completed `booking_payments` row, no ledger leg on failed or pending payments, the successful gateway row is tied to a booking, `total_paid` equals completed payments, `total_refunded` equals completed refunds, no refund larger than the amount paid, no impossible status pair, cancelled bookings with money left over, no reschedule that left both sides paid, cash refund legs net back to the refund amount, tip allocations, wallet balance equals wallet transactions, provider ledger balance is not negative, and an active subscription with a payment date always has a ledger row (none have a payment date).

`scripts/prod/audit-finance-ledger.mjs` passed the same three allow-listed queries (`duplicate_source_payment_rows`, `completed_refunds_without_ledger`, `paid_product_orders_missing_ledger`).

Vacuous, because staging has no rows: product orders, group bookings, custom offers and custom requests, gift cards, membership orders, terminal orders, and payout requests. The provider-balance check is not vacuous: it ran on the two providers that have ledger rows and found no negative balance.

### Failures

| Check | Count | What it is |
|---|---|---|
| `wallet.paid_topups_vs_ledger` | 1 | The paid R100 top-up is not on `finance_transactions` |
| `existing.tax_rate_data_quality` | 4 | Four providers store `tax_rate_percent = 0` while not VAT-registered |

## 3. Numbers the dashboards would show

Live HTTP calls had no staging session. `GET /api/admin/dashboard`, the provider finance routes, and `/api/me/bookings` returned 401. `GET /api/admin/finance/summary` and `/api/admin/finance/integrity-report` returned 500, because those handlers catch `Authentication required` and answer with a generic 500. The figures below are the same formulas those routes run (`aggregateFinanceLedgerRows` in `apps/web/src/lib/admin/aggregate-finance-ledger-rows.ts`, and `provider_finance_summary` executed on staging). Current month, previous month, and the SAST month were computed from the frozen ledger. Previous month is all zeros. Current UTC month and the SAST month match, because no ledger row falls in the 22:00–24:00 UTC window.

| Figure | Dashboard formula | Independent source | Difference |
|---|---|---|---|
| Service collected gross | 502.50 | Sum of `bookings.total_paid` = 502.50 | 0 |
| Provider earnings, gross | 400.00 | Sum of `provider_earnings.net` | 0 |
| Provider net after refunds | 172.50 | Earnings and tips left after refund nets (150.00 + 22.50) | 0 |
| Tips collected | 62.50 | Tips on the three paid bookings (22.50 + 10.00 + 30.00) | 0 |
| Gateway fees on services | 20.23 | Sum of `payment.fees` | 0 |
| Refunds gross | 565.00 | Completed `booking_refunds` = 315.00 | **+250.00** |
| Platform recognized revenue | 19.77 | Remaining platform fee R15.00 minus gateway fees R20.23 = −5.23 | **+25.00** |
| Wallet top-up on the ledger | 0.00 | Paid `wallet_topups` = 100.00 | **−100.00** |
| Shadow GL debits and credits | 1,067.50 and 1,067.50 | Same query | 0 |

Provider RPC against an independent sum of the same rows, for both providers that have ledger activity (`…0002` and `…0003`): service earnings R100 and R300, tips R10 and R52.50, refund deductions R110 and R180. No mismatches. Net after refunds is R0.00 and R172.50.

Customer columns, for the one customer who has bookings: `total_paid` matches completed payments, `total_refunded` matches the two completed refunds (R120 and R195), and each wallet balance matches the sum of its credits and debits. Those credits are the two booking refunds and the R100 top-up.

## 4. Findings

### F7-01 High — admin refunds gross double-counts refund components

`refunds_gross` sums the absolute `amount` of every cash refund leg. On a refund the legs are not a split of the cash: `provider_earnings.amount` is positive, the `payment` leg `amount` is the negative service base, and `tip` and `platform_fee` are positive again. Absolute values add the service base twice.

For the R120 refund the legs are provider earnings 100, tip 10, payment −100, platform fee 10. Absolute sum R220. For the R195 refund: payment −150, provider earnings 150, tip 30, platform fee 15. Absolute sum R345. Total R565. The signed `net` of those same legs is −120 and −195, which matches `booking_refunds` and `bookings.total_refunded`.

The ledger is right. The admin formula is wrong. Provider screens are not affected: `provider_finance_summary` uses `net`, and it matched.

Sketch: sum `abs(net)` of the cash legs, or sum `booking_refunds.amount` for completed refunds. Do not sum `abs(amount)` across components.

### F7-02 High — recognized platform revenue keeps refunded platform fees

`service_fee_revenue` sums `platform_fee.amount` (R40.00 on the three paid bookings) and never subtracts refund rows with `refund_component = 'platform_fee'` (net −R25.00). `platform_take_net` is −R20.23 because payment `net` is 0 and gateway fees are R20.23. Recognized platform revenue is therefore −20.23 + 40.00 = R19.77.

After the two refunds the platform still holds the completed booking's R15.00 fee and has paid R20.23 in gateway fees that the ledger does not reverse. Recognized result is −R5.23. The dashboard is R25.00 high, exactly the refunded platform fees.

Sketch: subtract refund `platform_fee` nets from `service_fee_revenue` before `platformRevenueNetFromAggregate`.

### F7-03 High — one paid wallet top-up never hit the ledger

A `wallet_topups` row of R100.00 is `paid` (2026-11-15 17:41 UTC). `wallet_transactions` has the matching `credit` / `wallet_topup`. `user_wallets.balance` matches the transaction sum, so the customer wallet is right. There is no `finance_transactions` row of type `wallet_topup`, and no `payment_transactions` row for that top-up. The success row in `payment_transactions` belongs to a booking.

`applyWalletTopupFromSuccessfulPaystackCharge` does insert both rows, and it is written to backfill them if the credit already exists. This top-up was marked paid without that insert. Replaying the charge through that function would post the missing legs. Until then, any card that reads the ledger (`wallet_topup_ledger`) shows R0. The finance summary's `wallet_topup_cash_collected` reads `wallet_topups` and would show R100, so the two cards on the same page disagree.

### F7-04 Low — tax-rate integrity flags unregistered providers stored as 0%

`list_integrity_tax_rate_data_quality` returns four providers, all `is_vat_registered = false`, `tax_rate_percent = 0.00`, no override: `00000000-e2e0-4000-b000-000000000001`, `…0002`, `…0003`, and `b61800f9-0f30-4462-88dc-597184c46590`. The sibling VAT-settings check treats 0% with no registration as valid, and no booking charged tax (`taxes_gross` is 0). The integrity report will list them. It does not change a money total.

Sketch: treat a null rate and an explicit 0 the same when the provider is not VAT-registered, or store null instead of 0.

### F7-05 Low — unauthenticated finance routes answer 500

`GET /api/admin/finance/summary` and `GET /api/admin/finance/integrity-report` on `https://staging.beautonomi.com` returned 500 with no session. `requireAdminSection` throws `new Error("Authentication required")`, and those two handlers map every throw to 500. Other admin routes returned 401. This does not change a figure. It does make a failed login look like a server fault.

## 5. Code risks that do not move today's staging numbers

Confirmed in code, measured against this freeze.

- `sumWalletTopupsForTenant` in `apps/web/src/app/api/admin/dashboard/route.ts` does not page. PostgREST returns at most 1,000 rows. Staging has 1 top-up, so the dashboard and the finance page agree. Above 1,000 paid top-ups the dashboard under-counts and the finance summary, which uses `fetchAllPages`, does not.
- Dashboard "all time" starts 24 months back (`LEDGER_TOTAL_MONTHS` in the same file). The oldest ledger row is 15 Nov 2026, so the window and a true all-time sum are both R502.50. Older history would disappear from the total cards only.
- Finance summary month boundaries are UTC. The dashboard reads `platform_settings.timezone`, which is null here, and then builds "today" in a way that cancels out on a UTC host. Both surfaces are on UTC, and no booking or ledger row sits in the two hours where a SAST day and a UTC day differ. They match now. They will diverge for money posted between 00:00 and 02:00 SAST once that timezone is set, and the dashboard "today" card will still follow the server clock.
- `settled_service_gmv` is an alias of gross collections. R502.50 includes the R315 that was later refunded in full. The gross number is the right gross. The word "settled" is not.
- Provider finance loads ledger rows in pages capped at 50,000 (`MAX_FINANCE_TRANSACTIONS`). Staging has 20.
- The in-app integrity report counts duplicate payment legs by loading at most 5,000 rows into the Node process. The SQL allow-list does the count in the database. Both are clean at 20 rows.
- No tenant has more than one currency, and the aggregator does not convert FX. A future mixed-currency tenant would be labelled `MIXED` and must not be shown as one total.

## 6. Are the numbers accurate?

**Superadmin.** Gross collections (R502.50), provider earnings, provider net after refunds (R172.50), tips, gateway fees, and the shadow ledger are accurate for the bookings that exist. Refunds gross (R565 instead of R315) and recognized platform revenue (R19.77 instead of −R5.23) are not. The ledger wallet-top-up figure (R0 instead of R100) is not; the customer wallet and the `wallet_topups` table are. Subscription revenue of R0 matches the fact that the three active subscriptions have never recorded a payment.

**Providers.** The finance summary RPC matches the ledger for both providers. Payout statements have no payouts to show, and neither provider has a negative ledger balance. The provider app uses this same summary.

**Customers.** Paid, refunded, and wallet balance match the source rows, including the R100 top-up and the two refunds credited back to the wallet.

**Orders, group bookings, custom offers, gift cards, memberships, terminals.** Staging has none. Those checks passed only because there was nothing to fail. This audit does not show that those flows will report correctly when they are used.

Nothing was changed on staging. The three money fixes are a formula change for refunds gross, a formula change so refunded platform fees leave recognized revenue, and a replay of the paid R100 top-up through `applyWalletTopupFromSuccessfulPaystackCharge` so the ledger leg exists.

## 7. Remediation (2026-11-16)

Re-run at `2026-11-16T09:41:02.761Z` after the formula change, migration `10181_wallet_topup_ledger_integrity_and_tax_rate`, and the staging ledger repair. `staging-finance-accuracy.mjs`: 51 checks, 37 PASS, 14 VACUOUS, 0 FAIL. `audit-finance-ledger.mjs`: `OK — ledger invariants hold.` Superadmin metric QA: 91 rows, 0 FAIL (`scripts/audit/out/staging-superadmin-metrics-qa.json`). Currency stayed ZAR. Previous month is 0. Finance month, the 24-month dashboard window, and all-time match because every ledger row is inside November 2026.

The paid R100 top-up now has one `payment_transactions` row and one `finance_transactions` row (`wallet_topup`, metadata `reference` + `wallet_topup_id`). The wallet was not credited again. A second call of the repair returned `already_posted`. `wallet_topup_ledger` and `wallet_topup_cash_collected` are both 100. Shadow GL debits and credits are both 1167.50 (the previous 1067.50 plus this R100), imbalanced 0, missing 0. `list_integrity_tax_rate_data_quality` and `list_integrity_paid_wallet_topups_missing_ledger` both return 0 rows.

Recognized figures below are the shared aggregator (`aggregateFinanceLedgerRows` / `platformRevenueNetFromAggregate`), which Finance Overview, Dashboard, Revenue, Gods Eye, Analytics, and marketplace health already call. There is no second refund or fee formula on those routes. HTTP checks against `staging.beautonomi.com` still see the previously deployed handlers, so unauthenticated `/api/admin/finance/summary` and `/api/admin/finance/integrity-report` still return 500 until this code is deployed. The route tests now expect 401 from `handleApiError`.

Every Finance Overview, Dashboard, Revenue, Gods Eye, and Analytics money field below is the shared aggregator recomputed from the ledger, checked against the independent source figure. All 91 are PASS.

| Metric | Expected | Actual | Verdict |
|---|---:|---:|---|
| `service_collected_gross` | 502.50 | 502.50 | PASS |
| `service_collected_net` | 482.27 | 482.27 | PASS |
| `refunds_gross` / `refunds_abs_gross` | 315.00 | 315.00 | PASS |
| `provider_earnings_net` | 400.00 | 400.00 | PASS |
| Provider net after refunds | 172.50 | 172.50 | PASS |
| `provider_refund_net_impact` | −290.00 | −290.00 | PASS |
| `tips_gross` | 62.50 | 62.50 | PASS |
| `taxes_gross` | 0.00 | 0.00 | PASS |
| `gateway_fees_services` / `gateway_fees_total` | 20.23 | 20.23 | PASS |
| Other gateway-fee streams | 0.00 | 0.00 | PASS |
| `service_fee_revenue` | 15.00 | 15.00 | PASS |
| `platform_commission_gross` / net | 0.00 | 0.00 | PASS |
| `platform_take_net` | −20.23 | −20.23 | PASS |
| `total_platform_commission_net` | −20.23 | −20.23 | PASS |
| `total_platform_take_net` | −5.23 | −5.23 | PASS |
| `total_platform_take_after_referrals` | −5.23 | −5.23 | PASS |
| `wallet_topup_cash_collected` / ledger | 100.00 | 100.00 | PASS |
| Gift cards, breakage, outstanding, memberships | 0.00 | 0.00 | PASS |
| Subscriptions, ads, marketing (net, gross, fees, VAT) | 0.00 | 0.00 | PASS |
| Cancellation, travel, walk-in, add-ons, manual adjustments | 0.00 | 0.00 | PASS |
| Discounts, loyalty, ecommerce fees, terminal commerce | 0.00 | 0.00 | PASS |
| Payouts | 0.00 | 0.00 | PASS |
| Platform cash collected | 602.50 | 602.50 | PASS |
| Platform cash refunds | 315.00 | 315.00 | PASS |
| Platform cash net | 267.27 | 267.27 | PASS |
| Dashboard GMV / refunds / earnings / tips / taxes / platform / wallet | same as Finance | same | PASS |
| Dashboard this month | same as all-time window | same | PASS |
| Dashboard last month GMV and platform | 0.00 | 0.00 | PASS |
| Revenue refunds / fee revenue / platform revenue | 315 / 15 / −5.23 | same | PASS |
| Gods Eye this month and all time | −5.23 | −5.23 | PASS |
| Analytics platform net / gateway fees | −5.23 / 20.23 | same | PASS |
| Marketplace take numerator | −5.23 | −5.23 | PASS |
| Marketplace contribution margin | −25.46 | −25.46 | PASS |
| GMV variance vs paid bookings | 0.00 | 0.00 | PASS |
| Shadow debit − credit | 0.00 | 0.00 | PASS |
| Currency | ZAR | ZAR | PASS |

Cross-surface equality for this window: Finance GMV = Dashboard GMV = Revenue GMV = SQL `service_collected_gross`; refunds match the dashboard total, the revenue report, and completed booking refunds; platform recognized revenue is `platformRevenueNetFromAggregate` on every surface that shows it; wallet cash collected matches the ledger after the backfill; provider earnings match the ledger. `platform_cash_position.refunds_gross` uses the same `refunds_abs_gross` field, now `abs(net)` of cash refund legs.
