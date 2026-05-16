# Beautonomi payout / reporting / accounting sign-off matrix

Companion doc to `docs/MANUAL_FINANCE_VALIDATION.md`. Where that doc audits the
booking → checkout → settlement → receipt chain, this one audits the
**reporting and payout layer** that consumes those values: admin and provider
finance dashboards, payouts, commission, ledger journal, and exports.

Use it after any change that touches `finance_transactions`, payout helpers,
report APIs, or admin/provider finance UIs.

## Non-negotiable accounting definitions

| Term                      | Meaning                                                                                                                  | Where canonical |
|---------------------------|-------------------------------------------------------------------------------------------------------------------------|-----------------|
| **Booked value (GMV)**    | `bookings.total_amount` on confirmed/completed bookings in range. Not collected. Not payoutable.                          | `bookings.total_amount` |
| **Settled service GMV**   | Aggregated booking GMV from `finance_transactions` (`payment.amount` + tip/tax/travel/platform_fee).                      | `aggregateFinanceLedgerRows.service_collected_gross` |
| **Collected amount**      | Completed `booking_payments` rows + walk-in `product_orders` paid + legacy sales rows in range.                          | `getRecordedTakingsForRange.totalRecorded` |
| **Ledger revenue**        | Settled `finance_transactions` activity for the range; admin-side platform truth.                                        | `aggregateFinanceLedgerRows` |
| **Provider earnings**     | `provider_earnings` ledger rows after commission. May differ from collected.                                             | `finance_transactions.transaction_type='provider_earnings'` |
| **Provider net activity** | Provider earnings + tips + travel + cancellation_fee − refunds.                                                          | `payments/summary.providerNetActivity` |
| **Payoutable amount**     | Platform-held provider earnings excluding direct (cash/EFT/manual/Yoco) walk-in money, less completed/pending payouts.   | `getAvailablePayoutBalance.availableBalance` |
| **Actual payout**         | A row in `payouts` with `status='completed'`, mirrored once into `finance_transactions(type='payout', payout_id)` (idempotent on `payout_id`). | `payouts` + `recordPayoutLedger` |
| **Commission / platform fee** | Platform-retained portion: `commission` column on `payment` rows; reversed proportionally on refund via `refund.commission`. | trigger `create_finance_ledger_from_payment` (migration 559) + webhook `charge-success.ts` |
| **End-of-day**            | Cash-register style total per provider per day. Not the same as ledger revenue or payout earnings.                        | `getRecordedTakingsForRange` |

## Surfaces audited in this pass

### Admin (Next.js / Vite SPA)

| Surface                                            | API                                            | Source of truth                                | Notes |
|---------------------------------------------------|------------------------------------------------|------------------------------------------------|-------|
| Finance summary cards                              | `/api/admin/finance/summary`                   | `aggregateFinanceLedgerRows`                   | Tenant-scoped via provider OR booking dual path; bookings GMV comparison reconciliation card. |
| Finance transactions list                          | `/api/admin/finance/transactions`              | `fetchFinanceLedgerExportRowsForTenant`        | Paginates entire result; `has_more` flag set from total. |
| Finance CSV export                                 | `/api/admin/export/finance`                    | `fetchFinanceLedgerExportRowsForTenant`        | 1000-per-page pagination over ALL matching rows; rate-limited. |
| Payout queue                                       | `/api/admin/payouts`                           | `payouts` table + `provider_payout_accounts`   | Negative balance providers surfaced in meta. |
| Payout approve / mark-paid / fail / reject         | `/api/admin/payouts/[id]/...`                  | `payouts` + `recordPayoutLedger`               | Money-safe ordering: ledger first, status flip second; idempotent on `payout_id`. |
| Yoco reconciliation                                | `/api/admin/reports/yoco-reconciliation`       | `provider_yoco_payments` + `booking_payments`  | Tenant-scoped via providers; default 100 rows, max 500 (limit acknowledged in tooltip; use export for bulk). |
| Wallet reconciliation                              | `/api/admin/finance/wallet-reconciliation`     | `wallet_transactions`                          | Drift detection; out-of-balance providers reported. |
| Period locks                                       | `/api/admin/finance/period-locks`              | `finance_period_locks`                         | Mark-paid + adjustments enforce lock via `enforcePeriodLock`. |
| Manual adjustments                                 | `/api/admin/finance/adjustments`               | `finance_transactions(type='manual_adjustment')` | Surfaces in summary `platform_take_net` and provider net. |

### Provider (Next.js portal + React Native app)

| Surface                                            | API                                                | Source of truth                                  | Notes |
|---------------------------------------------------|----------------------------------------------------|-------------------------------------------------|-------|
| Finance overview / dashboard cards                 | `/api/provider/finance`                            | full ledger pages + `getAvailablePayoutBalance` | Ledger queries paginate; aggregates scan all rows; transactions view limited to 50 most recent. |
| Finance CSV export                                 | `/api/provider/finance/export`                     | `finance_transactions` + booking + booking_payments enrichment | 1000-per-page pagination; columns include `booking_id`, `booking_number`, `product_order_id`, `payment_method`, `payment_provider`, fees, commission, currency, status. |
| End-of-day                                         | `/api/provider/reports/end-of-day`                 | `getRecordedTakingsForRange`                    | Single-day TZ-aligned; tip/cancellation rolled in. |
| Payment summary                                    | `/api/provider/reports/payments/summary`           | `finance_transactions` + `bookings` + `payment_transactions` | Wallet/gift de-duped against gateway captures; flags `cashStylePaymentsWithoutLedgerCount` when bp lacks finance ledger row. |
| Payment methods                                    | `/api/provider/reports/payments/methods`           | `payment_transactions` + `booking_payments`     | Wallet portion supplemented from booking when no settlement PT row. |
| Payouts ledger view                                | `/api/provider/reports/payments/payouts`           | `getProviderRevenue` + `finance_transactions`    | Per-booking/order net `provider_earnings` rows in window — explicitly **not** bank payout history. |
| Payout requests + history                          | `/api/provider/payouts`                            | `payouts` table                                 | Provider-friendly shape: `requested_at = created_at`. |
| Available balance for payout                        | `/api/provider/payouts` (POST validation)          | `getAvailablePayoutBalance`                     | Rounded to 2dp; concurrent payout guard re-checks balance after insert and rolls back on race. |
| Refunds report                                     | `/api/provider/reports/payments/refunds`           | `finance_transactions(type='refund')`           | Linked to bookings/orders by id. |
| Sales / revenue / business overview / top services | `/api/provider/reports/sales/*`, `/business/*`     | `finance_transactions` + bookings/orders        | Ledger-driven; TZ-aligned; location-attributed where possible. |
| Yoco reconciliation                                | `/api/provider/reports/payments/yoco-reconciliation` | `provider_yoco_payments`                        | Per-provider scope; reconcile against booking sync. |
| Provider mobile finance/payouts/transactions       | `apps/provider/...`                                | same APIs as web                                | Aggregates derived server-side; mobile only renders. |

### Backend

| Layer                                                                  | Where it lives                                                       |
|------------------------------------------------------------------------|----------------------------------------------------------------------|
| Booking payments + payment status trigger                              | `update_booking_payment_status` (migration 582; 0.01 tolerance)      |
| Finance trigger for non-Paystack `booking_payments`                    | `create_finance_ledger_from_payment` (migration 559)                 |
| Webhook handler (Paystack)                                             | `apps/web/src/app/api/payments/webhook/_handlers/charge-success.ts`  |
| Wallet/gift synthetic booking_payments                                 | `ensureWalletGiftBookingPayments` + migration 582 backfill           |
| Payout idempotent ledger write                                         | `recordPayoutLedger` (`finance_transactions` unique index on payout_id, migration 299) |
| Payout balance computation                                              | `getAvailablePayoutBalance`                                          |
| Admin ledger fetch (provider + booking dual path, dedup, pagination)   | `fetchFinanceLedgerRowsForTenant`, `fetchFinanceLedgerExportRowsForTenant` |
| Admin reducer (single source of truth for summary)                     | `aggregateFinanceLedgerRows`                                         |
| EOD / payment-method reducer                                            | `getRecordedTakingsForRange`                                         |
| Period lock guard                                                       | `enforcePeriodLock`                                                  |

## Payout exclusion truth table

| Booking source | Payment method (latest)            | Platform held the money? | Payoutable? |
|----------------|------------------------------------|--------------------------|-------------|
| `online`       | `paystack`                         | Yes                      | **Yes**     |
| `online`       | `wallet` (originally Paystack-funded) | Yes                   | **Yes**     |
| `online`       | `gift_card` (originally Paystack-funded) | Yes                | **Yes**     |
| `online`       | Mixed (e.g. `wallet`+`paystack`)   | Yes (each row payoutable proportional) | **Yes** |
| `walk_in`      | `paystack`                         | Yes (rare flow)          | **Yes**     |
| `walk_in`      | `cash`                             | No (provider drawer)     | **No**      |
| `walk_in`      | `bank_transfer` (EFT)              | No (provider bank)       | **No**      |
| `walk_in`      | `other` (manual card)              | No (provider terminal)   | **No**      |
| `walk_in`      | `yoco` (provider terminal)         | No (provider Yoco)       | **No**      |

**Operational acceptance check (not a code blocker, by design):**
If a *customer-led online* booking is later collected by the provider via a
Yoco terminal or manual card (i.e. the customer didn't pay via Paystack but
the provider still tapped a payment), the booking_source remains `online`
and the platform marks the resulting `provider_earnings` rows as payoutable.
Today this is treated as the rare exception — Beautonomi's product flow
keeps online bookings on Paystack. If this flow is operationalised, the
helper `getAvailablePayoutBalance` must switch from booking-level
`booking_source` to row-level `source_payment_id → booking_payments.payment_provider`
gating. Tests `available-payout-balance-scenarios.test.ts` would need to add
an "online booked, Yoco-collected" case at that point.

## Scenario matrix — payout, commission, ledger, reporting

For each row: **persist**, **payout effect**, **provider report**, **admin
report**, **export effect**. Tests mentioned are automated; ☐ rows are manual.

| #   | Scenario                                                  | Persist                                                                 | Payout                              | Provider report                              | Admin report                                  | Export                                            | Status |
|-----|----------------------------------------------------------|-------------------------------------------------------------------------|--------------------------------------|----------------------------------------------|-----------------------------------------------|--------------------------------------------------|--------|
| RP1 | Online Yoco/Paystack full booking                          | `bp` paystack; `ft` payment+earnings+platform_fee+tip/tax/travel       | Earnings payoutable; no double      | Payment summary: card; payouts ledger: net   | Finance summary: gmv, commission, take        | Provider/admin export include row(s)              | ☐      |
| RP2 | Online Yoco deposit + balance                              | 2 `bp` rows; 2 webhook commission/earnings rows                         | Each charge proportional payoutable | Payments summary shows both                  | Same                                          | Two ledger rows in export                         | ☐      |
| RP3 | Wallet + Yoco split                                        | bp wallet + bp paystack; trigger fires for wallet, webhook for Paystack | Sum of provider_earnings payoutable | Wallet bucket + card bucket                  | Wallet_collected + service_collected_gross    | Both rows in export                               | Auto (`payment-mix-receipt-scenarios.test.ts`) |
| RP4 | Gift card + Yoco split                                     | bp gift_card + bp paystack                                              | Same                                | Gift bucket + card bucket                    | Gift_card_collected + service_collected_gross | Same                                              | Auto (`payment-mix-receipt-scenarios.test.ts`) |
| RP5 | Wallet + gift + Yoco 3-way                                 | 3 bp rows                                                               | Sum of provider_earnings payoutable | All three buckets                            | Same                                          | All rows in export                                | Auto (`payment-mix-receipt-scenarios.test.ts`) |
| RP6 | Cash full (mark-paid)                                      | bp cash; trigger creates earnings (commission=0 if walk_in)             | **Not payoutable**                  | EOD cash bucket; payments-summary cash       | EOD-equivalent only; not in payout queue      | Visible in export with method=cash                | Auto (`available-payout-balance-scenarios.test.ts`) |
| RP7 | EFT (`bank_transfer`) full                                 | bp bank_transfer                                                        | **Not payoutable**                  | EOD EFT bucket                               | Same                                          | method=bank_transfer in export                    | Auto (`available-payout-balance-scenarios.test.ts`, `recorded-takings.test.ts`) |
| RP8 | Manual card (`other`) full                                 | bp other (card)                                                         | **Not payoutable**                  | EOD other bucket                             | Same                                          | method=other in export                            | Auto (`available-payout-balance-scenarios.test.ts`) |
| RP9 | Walk-in cash sale (`booking_source='walk_in'`)             | bp cash; **no platform fee** in ft                                      | Not payoutable                      | EOD cash bucket                              | Walk-in retail (sales) totals                 | export shows method=cash                          | ☐      |
| RP10 | Refund before payout                                      | refund ft inserted; provider_earnings net reduced                       | Reduces payoutable balance          | Refund report                                | Refunds_gross & provider_refund_net_impact     | refund row in export                              | Auto (`aggregate-finance-ledger-rows-scenarios.test.ts`) |
| RP11 | Refund after payout (clawback)                            | refund ft inserted (negative net); rawBalance can go negative           | `hasNegativeBalance=true` blocks new payouts; ops must reconcile | Provider sees Available=0 with banner | Admin sees negative provider in dashboard | refund row in export | Auto (`available-payout-balance-scenarios.test.ts`, `available-payout-balance.test.ts`) |
| RP12 | Payout request → approve → mark paid                       | `payouts.status` pending→processing→completed; `ft(type=payout)` row inserted (idempotent) | Available balance reduced by completed payouts and reserved by pending+processing | Payout history visible | Admin payouts queue + audit log | Payouts visible | ☐ (live) |
| RP13 | Payout failure                                             | mark-failed → `payouts.status=failed`; ledger row not touched           | Funds become available again         | History shows failed                          | Admin queue                                   | Payout shown                                     | ☐      |
| RP14 | Cancellation fee retained                                  | `cancellation_fee` ft, net = retained                                  | Payoutable for online bookings only  | Provider net activity includes               | `cancellation_fees_retained`                  | Visible                                          | Auto (`available-payout-balance-scenarios.test.ts`, `aggregate-finance-ledger-rows-scenarios.test.ts`) |
| RP15 | Tips                                                       | `tip` ft, amount=tip                                                    | Payoutable for online; not for direct walk-in | Tips collected, payments-summary | `tips_gross` | Visible | Auto |
| RP16 | Travel fee                                                 | `travel_fee` ft, amount=travel; `provider_earnings` includes travel    | Payoutable for online                | Travel fees report                           | `travel_fees`                                 | Visible                                          | Auto |
| RP17 | Manual adjustment (admin write)                            | `manual_adjustment` ft                                                  | Affects platform_take_net (not provider) | Not in provider payout                  | Surfaces in `manual_adjustments_net`          | Visible                                          | Auto (`aggregate-finance-ledger-rows-scenarios.test.ts`) |
| RP18 | Custom offer booking                                       | `bp paystack/wallet/gift_card`; ft `payment+earnings+platform_fee` tagged `[custom_offer:<id>]` | Same as online booking | Custom offer traceability via description    | Same                                          | Description column reveals custom_offer_id        | ☐ (description tag) |
| RP19 | Subscription / ad billing                                  | `provider_subscription_payment` / `provider_ads_payment` ft             | **Reduces** provider payout balance (platform-billed) | Shown as expense lines / fees hub           | `subscription_net` / `ads_net` separated      | Visible                                          | Auto (`aggregate-finance-ledger-rows-scenarios.test.ts`) |
| RP20 | Period lock                                                | `finance_period_locks`; mark-paid checks                                | Mark-paid blocked in locked period   | n/a                                          | Lock visible                                  | n/a                                              | ☐ |
| RP21 | Negative provider balance                                  | refund > earnings → `getAvailablePayoutBalance.hasNegativeBalance=true` | New payout requests rejected with `NEGATIVE_BALANCE` | Banner on provider finance | `negative_balance_providers` surfaced | n/a | Auto (`available-payout-balance.test.ts`) |
| RP22 | Concurrent payout race                                     | Second POST after first inserts → balance re-check rolls back the racy insert | `INSUFFICIENT_BALANCE` returned | n/a | n/a | n/a | ☐ (live) |
| RP23 | Wallet topup                                               | `wallet_topups.amount` paid                                             | Liability, not payoutable to provider | Not in provider report                  | `wallet_topup_revenue` (custodial cash collected) | Topup row in topup export | ☐ |
| RP24 | Gift card sale                                             | `gift_card_sale` ft + `gift_cards.balance`                              | Liability                            | Provider sees gift_card_sales_this_period    | `gift_card_sales` + outstanding liability      | Visible                                          | Auto (aggregate scenarios) |
| RP25 | Gift card redemption                                       | `gift_card_liability_reduction` ft + bp gift_card                       | Settlement creates payable earnings via trigger | Gift card bucket | `gift_card_liability_reductions` rolls forward | Visible | Auto (aggregate scenarios) |
| RP26 | Product order Yoco/card                                    | `product_orders` + bp paystack; `ft` payment+earnings+platform_fee     | Online order earnings payoutable     | Product/inventory reports                    | `service_collected_gross` includes order      | Visible                                          | ☐ |
| RP27 | Walk-in product order (cash/EFT/manual)                    | `product_orders.order_source=walk_in`; `payment_status=paid`            | NOT payoutable                       | EOD walk-in retail bucket                    | Same                                          | Visible                                          | Auto (`recorded-takings.test.ts`) |
| RP28 | Product order refund                                       | `product_orders.total_refunded`; `refund` ft                            | Reverses online order earnings        | Refund report                                | `refunds_gross`, `provider_refund_net_impact` | Visible                                          | ☐ |

## Required setup-action-expected rows

Use this when manually validating in staging.

| Setup                                                                            | Action                                              | Expected booking/payment rows                                                                | Expected `finance_transactions`                                                                      | Provider report                              | Admin report                                | Payout effect                              | Export                          |
|----------------------------------------------------------------------------------|----------------------------------------------------|---------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|----------------------------------------------|---------------------------------------------|--------------------------------------------|---------------------------------|
| Online customer booking R200, full Yoco                                          | Customer pays Paystack                             | 1 bp paystack; 1 payment_transaction success                                                | payment, provider_earnings, platform_fee, (tax/tip/travel if any)                                  | Card bucket; payments summary updated        | GMV, commission, take updated                | Earnings payoutable after hold              | Provider+admin export show row |
| Online customer booking R200, R100 deposit                                       | Customer pays deposit, then balance                | 2 bp rows; 2 PT rows; 2 webhook commission/earnings                                          | 2 payments, 2 earnings, 1 platform_fee (booking-once)                                              | Both card transactions visible               | GMV unchanged; commission accumulated        | Both earnings payoutable                    | Two ledger rows                |
| Customer R150 wallet + R50 card                                                  | Customer checks out                                 | bp wallet (R150) + bp paystack (R50); both completed                                       | wallet_payment + payment + 2 earnings; one platform_fee                                            | Wallet bucket R150, card R50                  | Wallet_collected R150, GMV R200             | Sum payoutable                              | Both rows                      |
| Customer R200 cash (provider mark-paid, walk_in)                                 | Provider POST mark-paid cash                       | bp cash R200                                                                                | provider_earnings R200 (commission 0); no platform_fee                                              | EOD cash R200                                | Walk-in retail R200                          | **Not payoutable**                          | row with method=cash           |
| Customer R200 EFT                                                                | Provider mark-paid bank_transfer                   | bp bank_transfer R200                                                                       | provider_earnings R200 (commission 0)                                                                | EOD EFT R200                                  | Same                                          | **Not payoutable**                          | row with method=bank_transfer  |
| Customer R200 manual card (Yoco terminal w/o link, walk_in)                      | Provider mark-paid card+other                      | bp other (card)                                                                              | provider_earnings R200                                                                              | EOD card/other bucket R200                    | Same                                          | **Not payoutable**                          | row with method=other          |
| Booking R200, paid online, then cancelled with R50 cancellation fee              | Customer cancels                                   | bp paystack R50; cancel + refund flow                                                       | cancellation_fee R50 net=50; refund row R150; provider_earnings reversed for service              | Cancel fee retained R50                       | Cancellation_fees_retained R50               | R50 payoutable; service share clawed back   | Cancel + refund visible        |
| Booking R200, paid online, then refunded R200                                   | Admin refunds                                      | refund row + earnings reversal                                                              | refund (net=-200, commission=-platform%); provider_earnings -X                                     | Refund report shows R200                      | refunds_gross R200; platform_refund_contra negative | Earnings clawed back; if exceeds available, exposes negative | Refund visible |
| Provider has R500 payoutable                                                     | Provider requests R400 payout                       | `payouts` row pending (R400)                                                                | nothing in ft yet                                                                                   | Pending payout R400                           | Admin queue shows                             | Available R100; no double                   | Pending payout in queue        |
| Provider has R500 payoutable; existing R400 pending                              | Admin approves → marks paid                         | `payouts.status=processing→completed`                                                       | ft `type=payout` R400 (idempotent on payout_id)                                                     | Completed in history                           | Audit log; `payouts` table                   | Available R100                               | Payout export shows R400      |
| Wallet R200 deposit on partially-paid booking                                    | Inspect provider mobile booking detail              | bp wallet R200                                                                              | wallet_payment R200; payment R200 (proportional commission); provider_earnings X                  | Wallet bucket R200                            | wallet_collected R200                         | Earnings payoutable                          | Both rows                      |
| Provider exports finance for month                                                | Click export                                        | n/a                                                                                          | n/a                                                                                                 | CSV download with booking_id, booking_number, product_order_id, payment_method/provider, fees, commission | n/a | n/a | Full month no row cap |

## Sign-off matrix (smoke pass)

| #  | Scenario                                                          | Pass? |
|----|------------------------------------------------------------------|-------|
| 1  | Online Yoco full booking → admin finance → provider report → payout history | ☐ |
| 2  | Yoco deposit + balance → ledger has 2 commission rows; both payoutable | ☐ |
| 3  | Wallet + Yoco split → payouts and provider report decompose       | ☐ |
| 4  | Gift card + Yoco split → payouts and provider report decompose    | ☐ |
| 5  | Cash booking → EOD yes, payout no                                  | ☐ |
| 6  | EFT booking → EOD yes, payout no                                   | ☐ |
| 7  | Manual card booking → EOD yes, payout no                           | ☐ |
| 8  | Yoco terminal walk-in → EOD yes, payout no                         | ☐ |
| 9  | Refund before payout → balance reduces correctly                   | ☐ |
| 10 | Refund after payout → exposes negative balance, blocks new payout  | ☐ |
| 11 | Custom offer booking → finance ledger description tagged           | ☐ |
| 12 | Package booking → admin & provider reports correct                 | ☐ |
| 13 | Group booking → child rows visible; admin sums right               | ☐ |
| 14 | Product order Yoco → admin & provider reports include              | ☐ |
| 15 | Product order walk-in cash → EOD yes, payout no                    | ☐ |
| 16 | At-home booking with travel → travel_fee shown separately          | ☐ |
| 17 | Booking with tip → tip ledger row; payoutable for online           | ☐ |
| 18 | Manual adjustment → only platform side affected                    | ☐ |
| 19 | Provider finance CSV export columns include all required fields    | ☐ |
| 20 | Admin finance CSV export full set; matches summary screen totals   | ☐ |
| 21 | Payout request → approve → mark-paid path; ledger idempotent        | ☐ |
| 22 | Period lock prevents mark-paid in locked period                    | ☐ |
| 23 | Subscription / ads billing isolated from provider payout balance   | ☐ |
| 24 | Gift card liability rollforward (sale vs liability_reduction)      | ☐ |

## Automated coverage backing this matrix

- `apps/web/src/lib/provider/__tests__/available-payout-balance.test.ts` —
  online + walk-in paystack inclusion; walk-in non-paystack exclusion; refund clawback negative balance.
- `apps/web/src/lib/provider/__tests__/available-payout-balance-scenarios.test.ts` —
  full payout exclusion matrix (cash, EFT, manual card, Yoco), tips/travel/cancellation
  pass-throughs, hold period gating, refund clawback during hold, pending payouts
  reservation, service_fee exclusion, 2dp rounding, drift gate.
- `apps/web/src/lib/admin/aggregate-finance-ledger-rows.test.ts` —
  legacy + ecommerce platform fee separation; refund commission/net split.
- `apps/web/src/lib/admin/__tests__/aggregate-finance-ledger-rows-scenarios.test.ts` —
  wallet+card GMV; tips/taxes/travel/platform_fee inside booking GMV; ecommerce
  fee isolation; refund split commission/net; subscription/ads isolation;
  manual_adjustment effect on platform_take_net; cancellation_fees_retained;
  promotion_discount pass-through; gift_card_sale + liability_reduction;
  provider_earnings_net post-refund; additional_charge_gross.
- `apps/web/src/lib/reports/__tests__/recorded-takings.test.ts` —
  per-method aggregation; split-safe wallet de-dup; legacy wallet booking;
  walk-in product orders; tips/cancellation_fees from ledger; total formula;
  unknown method normalization to "other".
- `apps/web/src/lib/orders/__tests__/...` — product order ledger writes.
- `apps/web/src/lib/finance/__tests__/...` — period locks; commission resolver.

## Real blockers

None at the code level for the audited scenarios above. Remaining acceptance
checks (live-only):

1. **Yoco terminal settlement reconciliation** — confirm Yoco merchant account
   bank settlement vs `provider_yoco_payments` totals weekly. Tooling already
   in place (`/api/admin/reports/yoco-reconciliation`); requires staging data.
2. **Bank payout reconciliation** — confirm `payouts` marked-paid totals match
   bank file. Requires ops/finance verification per cycle.
3. **Custom offer description tag (`[custom_offer:<id>]`)** in
   `finance_transactions.description` — manually verify across reports until a
   `custom_offer_id` column or join is added (low priority architectural debt).
4. **Refund-after-payout** end-to-end — exercised in code (`hasNegativeBalance`
   gate), but full ops playbook (manual adjustment vs claw-back next payout) is
   a finance-team SOP, not a code path.

## Surfaces touched in this audit

- `apps/web/src/app/api/provider/finance/export/route.ts` — full-column CSV
  export with `booking_id`, `booking_number`, `product_order_id`, `fees`,
  `commission`, `currency`, `status`, `payment_method`, `payment_provider`.
- `apps/web/src/lib/provider/__tests__/available-payout-balance-scenarios.test.ts`
  — new test file with 9 scenarios covering payout exclusion matrix.
- `apps/web/src/lib/admin/__tests__/aggregate-finance-ledger-rows-scenarios.test.ts`
  — new test file with 12 scenarios covering admin reducer correctness.
- `apps/web/src/lib/reports/__tests__/recorded-takings.test.ts` — new test
  file with 8 scenarios covering EOD/payment-method semantics.
- `docs/MANUAL_PAYOUT_REPORTING_VALIDATION.md` — this doc.

## Cross-references

- `docs/MANUAL_FINANCE_VALIDATION.md` — booking pricing / receipt / payment
  truth (upstream of reporting/payout).
- `supabase/migrations/559_platform_fee_booking_unification.sql` — non-Paystack
  booking_payments → ledger trigger.
- `supabase/migrations/582_booking_payments_wallet_gift_and_payment_status_tolerance.sql`
  — wallet/gift booking_payments backfill + 0.01 paid tolerance.
- `supabase/migrations/583_normalize_booking_pricing_columns.sql` — historical
  subtotal/discount normalization.
- `supabase/migrations/299_payout_ledger_and_hold.sql` — `payout_id` unique
  index on `finance_transactions` (idempotent payout ledger writes).
