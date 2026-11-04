# Money-path facts map (local QA)

Facts-based inventory for bookings, till sales, product orders, refunds, payouts, and reporting.  
Constraints: migrations `10102`–`10106` not assumed applied; `finance.provider_vat_payout` stays off.

## 1. Money entry points (inventory)

### Bookings — charge / settle

| Entry | Path | Primary writers |
| --- | --- | --- |
| Public checkout PSP | `apps/web/src/app/api/public/bookings/_helpers/process-payment.ts` | `booking_payments`, gift reserve/capture, ledger via settler |
| Paystack verify / replay | `apps/web/src/app/api/paystack/verify/route.ts`, `verify-reference/route.ts` | `recordPaystackBookingSettlement`, `recordBookingPaystackPayment` |
| Pay remaining / mark-paid | `apps/web/src/app/api/me/bookings/[id]/pay-remaining/route.ts`, `provider/.../mark-paid/route.ts` | collectible ledger, `booking_payments` |
| Card machine | `apps/web/src/lib/payments/settle-card-machine-payment.ts` | `booking_payments`, `record-collectible-settlement-ledger.ts` |
| Additional charges | `apps/web/src/app/api/me/bookings/[id]/additional-charges/[chargeId]/pay/route.ts` | per-charge ledger legs |
| Reconcile cron | `apps/web/src/lib/bookings/reconcile-online-charge-ledger.ts` | backfill missing `finance_transactions` |

### Bookings — display

| Surface | Path |
| --- | --- |
| Outstanding (web/mobile collect) | `apps/web/src/lib/bookings/display-invariants.ts` → `computeBookingOutstandingDisplay` |
| Receipt JSON/PDF | `apps/web/src/lib/receipts/build-booking-receipt.ts` |

### POS / till sales

| Entry | Path |
| --- | --- |
| Yoco success | `apps/web/src/lib/payments/yoco-apply-successful-settlement.ts` |
| PayCloud settle | `apps/web/src/lib/payments/settle-paycloud-payment.ts` (via card-machine) |
| Sale gift | `apps/web/src/lib/gift-cards/sale-gift-card.ts` |
| Revenue exclusion | `apps/web/src/lib/reports/provider-sales-history.ts` → `isBookingCollectionSale` |

### Product orders

| Entry | Path |
| --- | --- |
| Record payment + ledger | `apps/web/src/lib/orders/record-product-order-payment.ts` |
| Amount still due | `apps/web/src/lib/payments/resolve-paystack-initialize-amount.ts` |
| Card machine settle | `settle-card-machine-payment.ts` → `settleProductOrderPayment` |
| Mark collected | `apps/web/src/app/api/provider/product-orders/[id]/mark-collected/route.ts` |
| Cancel / unpaid refund | `apps/web/src/lib/orders/product-order-lifecycle.ts`, `refund-unpaid-product-order-card-charges` |
| API amount_still_due | `withProductOrderAmountStillDue` on provider + customer GET order routes |
| Display remainder | `apps/web/src/lib/orders/product-order-tender.ts` → `displayedProductOrderAmountStillDue` |
| Receipts | `apps/web/src/lib/receipts/build-order-receipt.ts`, `loadProductOrderReceiptCardPaid` |

### Payouts / finance

| Entry | Path |
| --- | --- |
| Withdrawable balance | `apps/web/src/lib/provider/available-payout-balance.ts` |
| Refund component clawback | `apps/web/src/lib/ledger/refund-components.ts` |
| Integrity report (read-only) | `apps/web/src/lib/admin/finance-integrity-report.ts` |

### Reporting

| Report | Path |
| --- | --- |
| Retail takings | `apps/web/src/lib/reports/provider-retail-takings.ts` |
| Recorded takings | `apps/web/src/lib/reports/recorded-takings.ts` |
| Gift redemptions | `apps/web/src/lib/reports/gift-card-provider-redemptions.ts` |
| Dashboard earnings mix | `apps/web/src/lib/provider-revenue-semantics.ts`, `get-provider-dashboard.ts` |

## 2. Core formulas (canonical)

| Domain | Formula | Function |
| --- | --- | --- |
| Booking outstanding | `max(0, total + add-ons − max(effectivePaid + pendingWalletGift, wallet+gift))` | `computeBookingOutstandingDisplay` |
| Product order card due | `max(0, total − wallet − gift − priorCardPayments)` | `productOrderAmountStillDue` |
| Product order in-person (no prior card in API field) | `productOrderTenderSplit(order).remainder` or server `amount_still_due` | `displayedProductOrderAmountStillDue` |
| Unpaid order receipt paid | `min(total, wallet + gift + cardPaid)` | `computeOrderReceiptFinancials` |
| Payout balance | Sum payoutable `finance_transactions` types minus payouts; exclude provider-collected bookings | `getAvailablePayoutBalance` |

## 3. Scenario matrix (A1–F1)

| ID | Scenario | Truth / writers | Surfaces | Proof (tests) |
| --- | --- | --- | --- | --- |
| A1 | Online booking card + ledger | `process-payment`, reconcile | Receipt, pay CTA | `reconcile-online-charge-ledger.test.ts`, paystack verify tests |
| A2 | Wallet/gift + card, pending | outstanding helpers, guards | Web/mobile collect | `outstanding-no-double-subtract.test.ts`, paycloud/yoco guard tests |
| A3 | Deposit still due | PayCloud amount helpers | Provider booking pay | PayCloud deposit tests |
| A4 | Additional charge mixed tender | additional-charge pay + ledger | Receipt | extra-charge settlement tests |
| A5 | Group / guest share | group routes, verify-reference | Group UI | guest-share / outstanding tests |
| B1 | Booking-collection sale | Yoco settles booking; no stock | Sales history excludes | `yoco-apply-successful-settlement.test.ts` |
| B2 | Till sale + gift | `sale-gift-card.ts` | Till complete | sale gift tender tests |
| C1 | Product order Paystack + wallet/gift | `resolveProductOrderPaystackAmount` | Customer pay | `product-order-paystack-charge-allowed.test.ts`, verify-product-order |
| C2 | Provider-collected remainder | `record-product-order-payment`, card settle | Provider collect | `settle-yoco/paycloud`, `record-product-order-payment.test.ts` |
| C3 | Partial card on order | `settleProductOrderPayment` | Terminal/Yoco | settle tests, terminal allocation |
| C4 | Unpaid cancel / expire | lifecycle + refund unpaid card | Cancel API | `refund-unpaid-product-order-card.test.ts`, cancel tests |
| C5 | Order receipt parity | `build-order-receipt.ts` | JSON/PDF | `build-order-receipt.test.ts` |
| D1 | Retail vs earnings split | retail + recorded takings | Dashboard/EOD | `provider-retail-takings.test.ts`, `recorded-takings.test.ts` |
| D2 | Gift redemption all sources | `fetchProviderGiftCardRedemptions` | Gift report | `gift-card-provider-redemptions-fetch.test.ts` |
| E1 | Booking refund clawback | refund components + payout reader | Payout UI | `available-payout-balance.test.ts`, refund-components usage |
| E2 | Product order refund tender | cancel/refund routes, card reverse | Provider refund | `route.refund-tender.test.ts`; `reverse-card-machine-product-order.test.ts` |
| E3 | Idempotent replay | verify-reference, 23505 paths | Webhooks | verify + reconcile tests |
| F1 | Available payout | `available-payout-balance.ts` | Withdraw | `available-payout-balance.test.ts`, scenarios test |

## 4. Cross-platform touchpoints (by scenario type)

- **Customer web**: `OrdersIdPageClient.tsx` (`displayedProductOrderAmountStillDue`), booking receipt pages, `/api/me/orders/[id]`, `/api/paystack/initialize`.
- **Customer mobile**: `product-order-detail.tsx` (`amount_still_due`), `useProductOrders` → GET `/api/me/orders/[id]`.
- **Provider web**: `ecommerce/orders/page.tsx`, `ProductOrderViewSheet.tsx`, mark-collected, card machine dialogs.
- **Provider mobile**: `product-orders.tsx` (`productOrderInPersonDue` + `amount_still_due` from API).
- **Admin**: integrity report route (read-only); no payout mutation in this QA scope.

## 5. Gap list (tests added / remaining)

| Priority | Gap | Status |
| --- | --- | --- |
| 1 | Gift report includes order + till | **Added** `gift-card-provider-redemptions-fetch.test.ts` |
| 2 | `amount_still_due` on provider/customer orders | **Added** `withProductOrderAmountStillDue` tests; route coverage via mark-collected + API field on GET routes |
| 3 | Mark-collected uses server card due | **Added** mark-collected tests + mock `productOrderCardAmountStillDue` |
| 4 | Card-machine product full refund | **Added** `apps/web/src/lib/payments/__tests__/reverse-card-machine-product-order.test.ts` |
| 5 | charge.failed then success race | **Added** `apps/web/src/app/api/payments/webhook/_handlers/__tests__/charge-success-product-order-late-success-refund.test.ts` + handler refunds late success |
| 6 | Customer GET order contract | Covered by `withProductOrderAmountStillDue` unit tests + golden invariants |
| 7 | Receipt parity | **Added** `build-order-receipt.test.ts` + golden invariants |

## 6. Regression bundles (run after changes)

See [money-path-regression-guardrails.md](./money-path-regression-guardrails.md).

Golden suite: `apps/web/src/lib/money-flow/__tests__/money-path-golden-invariants.test.ts`.
