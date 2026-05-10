# Beautonomi finance sign-off matrix

Use this matrix after pricing / receipt / payment / migration changes to confirm
end-to-end financial coherence. Each scenario must pass every verification column.

## Canonical conventions

- `bookings.subtotal` = sum of priced line items only (services + addons + products), **never** travel.
- `bookings.travel_fee` = travel only.
- `bookings.discount_amount` = manual + coupon + catalog package only.
- `bookings.promotion_discount_amount` = promo only.
- `bookings.membership_discount_amount` = membership only.
- `bookings.loyalty_discount_amount` = loyalty redemption only.
- Wallet (`wallet_amount`) and gift card (`gift_card_amount`) are **payments / settlements**, not discounts.
- `total_amount = subtotal + travel + tax + platform_fee + tip - (discount + promo + membership + loyalty + cancellation)`
- `total_paid = SUM(booking_payments.amount where status IN (completed, partially_refunded))`
  - Post-migration 582 this **already includes** wallet + gift card synthetic
    `booking_payments` rows. UI must NEVER subtract `wallet_amount` /
    `gift_card_amount` again on top of `total_paid` — that would double-subtract.
- `payment_status = paid` when `total_paid + 0.01 >= total_amount` (migration 582 trigger).
- Outstanding (UI) = `max(0, total_amount + unpaid_additional_charges - max(effective_paid, wallet+gift))`.
  The `max(...)` keeps legacy pre-582 rows correct without double-subtracting.

## Verification columns

For each scenario, verify:

1. **Checkout total** — public/provider checkout shows the same number as `bookings.total_amount`.
2. **Booking row** — decomposed columns reconcile to `total_amount` (invariant above).
3. **`booking_payments` rows** — exist for every settlement (card / wallet / gift / cash / EFT).
4. **`payment_transactions`** — present for online card flows; reference matches `booking_payments`.
5. **`finance_transactions`** — net effect equals expected provider revenue + commission.
6. **Booking detail** — customer mobile / customer web / provider mobile / provider web all show the same decomposed values.
7. **Receipt JSON** — `/api/bookings/[id]/receipt` and `/api/provider/bookings/[id]/receipt` both reconcile.
8. **Receipt PDF** — PDF body matches the JSON payload, with a "Payments" table that lists
   each completed `booking_payments` row by canonical method label
   (Wallet · Gift card · Cash · EFT · Card (Yoco) · Card (manual) · Card · Other).
9. **`payment_status`** — terminal state correct (`paid` / `partially_paid` / `refunded`).
10. **`balance_due`** — UI matches `max(0, total_amount - max(effective_paid, wallet+gift))` so
    a wallet-only deposit on a partially-paid booking still shows the real balance.
11. **Provider/admin reports** — payment-method breakdown and revenue totals reflect the booking.
12. **No double-presentation** — wallet/gift never appear as both a deduction line **and** a payment row.

## Booking composition matrix

| #   | Composition                                          | Persistence checks                                                                       | Pass? |
|-----|-----------------------------------------------------|------------------------------------------------------------------------------------------|-------|
| C1  | Single service                                       | 1 `booking_services`; `subtotal = line.price`                                            | ☐     |
| C2  | Multiple services                                    | N `booking_services`; `subtotal = SUM(prices)`                                           | ☐     |
| C3  | Service with service variant                         | `booking_services.service_variant_id` set; price reflects variant                       | ☐     |
| C4  | Service with add-ons                                 | N `booking_addons`; subtotal includes addons                                             | ☐     |
| C5  | Multi-service + add-ons                              | All line rows present; subtotal = services + addons                                      | ☐     |
| C6  | Booking with product line / `booking_products`       | N `booking_products`; subtotal includes products                                         | ☐     |
| C7  | Booking with product variant                         | `booking_products.product_variant_id` set; receipt shows variant label                  | ☐     |
| C8  | Package booking, services only                       | `package_id` set; `discount_amount` = package savings; `subtotal` = lines pre-discount   | ☐     |
| C9  | Package + product variant                            | Same as C8 + product line; package discount only on services                             | ☐     |
| C10 | Package + add-ons (separate upsells)                 | Add-ons priced full; package savings only on services                                    | ☐     |
| C11 | Group booking (per-participant child rows)           | N child `bookings.group_booking_id`; per-child `total_amount`; group receipt aggregates  | ☐     |
| C12 | Group package booking                                | All children share `package_id`; per-child decomposition                                 | ☐     |
| C13 | Custom-offer booking                                 | `bookings.custom_offer_id` set; finance_transactions tagged `[custom_offer:<id>]`        | ☐     |
| C14 | Recurring booking                                    | Each occurrence is its own booking with full decomposition                               | ☐     |
| C15 | At-salon booking                                     | `location_type = at_salon`; `travel_fee = 0`                                            | ☐     |
| C16 | At-home booking with travel                          | `location_type = at_home`; `travel_fee > 0`; not in subtotal                            | ☐     |
| C17 | Walk-in sale (provider)                              | `booking_source = walk_in`; no platform fee row in finance_transactions                  | ☐     |
| C18 | Provider-scheduled booking                           | `booking_source = provider`; full pricing decomposition                                  | ☐     |
| C19 | Customer-led online booking                          | `booking_source = online`; platform fee row + commission                                 | ☐     |

## Payment-method matrix

| #   | Method / mix                                             | Persistence checks                                                                                                      | Pass? |
|-----|---------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|-------|
| P1  | Yoco / card full payment (online)                        | 1 `booking_payments` (`card`/`paystack`); `payment_transactions`; `finance_transactions` payment+earnings+platform_fee  | ☐     |
| P2  | Yoco / card deposit                                      | 1 `booking_payments` deposit row; status `partially_paid`; balance computed correctly                                  | ☐     |
| P3  | Yoco / card balance after deposit                        | 2 `booking_payments` rows; second `payment_transactions` "second charge" branch fires                                   | ☐     |
| P4  | Failed Yoco payment                                      | No `booking_payments`; booking remains pending; gift/wallet reservations released                                       | ☐     |
| P5  | Duplicate Yoco webhook                                   | Single `booking_payments` (idempotent on payment_provider+payment_provider_id)                                          | ☐     |
| P6  | Yoco refund / partial refund                             | `booking_refunds` row; `total_refunded` updated; receipt shows refund line                                              | ☐     |
| P7  | Cash full (provider mark-paid)                           | `booking_payments.payment_method = cash`, `payment_provider = cash`; finance trigger creates `provider_earnings` row    | ☐     |
| P8  | Cash deposit, balance later                              | 2 `booking_payments` rows of method `cash`; idempotent on stable reference if supplied                                  | ☐     |
| P9  | Walk-in cash sale                                        | `booking_source = walk_in`; **no** platform_fee finance row                                                             | ☐     |
| P10 | EFT full (`bank_transfer`)                               | `booking_payments.payment_method = bank_transfer`; receipt PDF labels "EFT"                                             | ☐     |
| P11 | EFT deposit then balance                                 | 2 `booking_payments` rows; receipt shows both as "EFT" lines                                                            | ☐     |
| P12 | Manual card (`card` + provider `other`)                  | `booking_payments` with `payment_provider = other`; receipt PDF labels "Card (manual)"                                  | ☐     |
| P13 | Wallet full payment                                      | 1 `booking_payments` `wallet`/`wallet`; `payment_provider_id = wallet_booking:<id>`; auto-paid via 0.01 tolerance       | ☐     |
| P14 | Wallet + Yoco card split                                 | 2 `booking_payments` rows (wallet + paystack); receipt PDF lists both                                                   | ☐     |
| P15 | Wallet + cash (provider-collected balance)               | wallet row from booking creation + cash row from mark-paid                                                              | ☐     |
| P16 | Wallet refund/reversal (cancellation)                    | Wallet booking_payments untouched; `wallet_refund` finance row + restore credit                                         | ☐     |
| P17 | Gift card full                                           | 1 `booking_payments` `gift_card`/`gift_card`; redemption captured via RPC                                               | ☐     |
| P18 | Gift card + Yoco card split                              | 2 `booking_payments` rows; gift_card_redemptions capture happens after card success                                     | ☐     |
| P19 | Gift card + wallet (no card)                             | 2 `booking_payments` rows; both treated as payment, never as discount                                                   | ☐     |
| P20 | Gift card refund                                         | Captured redemption is reversible per gift-card balance rules; receipt reflects refund                                  | ☐     |
| P21 | Wallet + gift + Yoco card (3-way mix)                    | 3 `booking_payments` rows; PDF Payments section shows all three; status `paid`                                          | ☐     |
| P22 | Deposit by one method, balance by another                | 2 `booking_payments` rows of different methods; receipt shows both                                                      | ☐     |
| P23 | Custom offer full card payment                           | `booking_payments` (paystack) + finance_transactions payment+earnings+platform_fee tagged `[custom_offer:<id>]`         | ☐     |
| P24 | Custom offer deposit                                     | Booking created with `partially_paid`; deposit `booking_payments`; later balance webhook adds second row                | ☐     |

## Discount / promo / membership / package / loyalty matrix

| #   | Instrument                                  | Rules verified                                                                                          | Pass? |
|-----|---------------------------------------------|---------------------------------------------------------------------------------------------------------|-------|
| D1  | Manual discount (`discount_amount`)         | Stored alone; no folded membership/promo                                                                | ☐     |
| D2  | Catalog package discount                    | Stored in `discount_amount` only when entitlement applies; package_id set                              | ☐     |
| D3  | Promo / coupon (`promotion_discount_amount`)| Server-validated; cleared if cart fingerprint changes                                                  | ☐     |
| D4  | Membership (`membership_discount_amount`)   | Single decomposed line; never folded into `discount_amount`                                            | ☐     |
| D5  | Loyalty (`loyalty_discount_amount`)         | Decomposed; `loyalty_points_used` matches; `customer_loyalty_redemptions` row inserted                 | ☐     |
| D6  | Membership + promo                          | Both lines on receipt; do not double count                                                             | ☐     |
| D7  | Loyalty + membership                        | Both lines on receipt; do not double count                                                             | ☐     |
| D8  | Package + add-on (add-on full price)        | Add-on not discounted by package                                                                        | ☐     |
| D9  | Custom offer + promo (when allowed)         | Promo applied off offer price; commission base reflects promo                                          | ☐     |
| D10 | Wallet + promo                              | Wallet not treated as discount; promo applies pre-wallet                                               | ☐     |
| D11 | Gift card + promo                           | Gift card not treated as discount; promo applies pre-gift                                              | ☐     |
| D12 | Service variant + discount                  | Discount applies to variant price, not base                                                            | ☐     |
| D13 | Invalid promo                               | Rejected with canonical reason; no discount fields persisted                                           | ☐     |
| D14 | Promo removal / cart change                 | Promo state cleared; subtotal restored                                                                  | ☐     |

## Products / e-commerce matrix

| #   | Scenario                                                  | Verified                                                                                                | Pass? |
|-----|----------------------------------------------------------|---------------------------------------------------------------------------------------------------------|-------|
| E1  | Product attached to booking                                | `booking_products` row; product line on receipt                                                         | ☐     |
| E2  | Product variant on booking                                 | Variant label on receipt                                                                                 | ☐     |
| E3  | Direct product order (no booking)                          | `product_orders` row; order receipt PDF/JSON                                                            | ☐     |
| E4  | Product order with shipping/delivery                       | Shipping fee separate from subtotal                                                                     | ☐     |
| E5  | Product order paid Yoco/card                               | `payment_transactions` + `finance_transactions` for order                                               | ☐     |
| E6  | Product order paid wallet/gift                             | Order accepts wallet/gift; receipt shows credit                                                         | ☐     |
| E7  | Product order refunded                                      | `total_refunded` updated; receipt shows refund                                                          | ☐     |
| E8  | Inventory decremented on capture                            | `product_variants.stock_quantity` decremented                                                           | ☐     |

## Display / mobile UI matrix

| #   | Scenario                                                                | Verified                                                                                          | Pass? |
|-----|------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|-------|
| U1  | Provider mobile booking detail — wallet+card+gift fully paid           | "Paid (wallet) / Paid (gift card) / Paid (card / other) / Total paid" rows; outstanding 0          | ☐     |
| U2  | Customer mobile booking detail — same                                  | Same canonical breakdown                                                                          | ☐     |
| U3  | Customer web booking detail (`/account-settings/bookings/[id]`)        | Wallet/gift only in payments breakdown; never deduction lines                                     | ☐     |
| U4  | Customer web receipt page                                              | Payments section lists each booking_payment with method label                                      | ☐     |
| U5  | Provider PDF receipt                                                   | Payments table shows each `booking_payments` row; no "Wallet applied: −R…" deduction              | ☐     |
| U6  | Customer PDF receipt                                                   | Same                                                                                               | ☐     |
| U7  | Provider mark-paid sheet (yoco prefill)                                | Pre-fills correct remaining balance, never under-charges                                          | ☐     |
| U8  | Wallet-only deposit on partially-paid booking                          | Provider/customer detail shows true balance (not 0)                                               | ☐     |
| U9  | Customer share text                                                    | "Paid via" block instead of negative wallet/gift lines                                            | ☐     |
| U10 | Booking cards / calendar cards                                         | Show `total_amount` only; no double-subtracted "discount"                                          | ☐     |

## Reports / payouts matrix

| #   | Scenario                                       | Verified                                                                                          | Pass? |
|-----|-----------------------------------------------|---------------------------------------------------------------------------------------------------|-------|
| R1  | Provider end-of-day                            | Totals match sum of `booking_payments` for the day, by method                                     | ☐     |
| R2  | Payment summary report                          | Wallet, gift, cash, EFT, card columns sum to total revenue                                        | ☐     |
| R3  | Payouts                                         | Online provider_earnings minus refunds = payoutable; cash/EFT/manual NOT in payout                | ☐     |
| R4  | Commission                                     | Online: `commission_base * platform_commission_pct`; walk-in: 0                                   | ☐     |
| R5  | Refund effect                                  | Refund finance row inserted; provider_earnings reduced; payouts adjusted                          | ☐     |
| R6  | Custom offer revenue traceability              | finance_transactions descriptions contain `[custom_offer:<id>]`                                   | ☐     |
| R7  | Gift card / wallet liability rollforward       | `gift_card_liability_reduction` finance rows balance gift_card_amount                              | ☐     |
| R8  | Branch attribution                             | Unattributed bookings appear in unattributed bucket, not folded into wrong branch                  | ☐     |

## Sign-off matrix (smoke pass)

| #  | Scenario                                                            | Pass? |
|----|---------------------------------------------------------------------|-------|
|  1 | Customer full card payment (full payment, no extras)                | ☐     |
|  2 | Customer wallet + card full payment                                 | ☐     |
|  3 | Customer gift card + card full payment                              | ☐     |
|  4 | Membership discount booking (single decomposed line)                | ☐     |
|  5 | Promo booking (single decomposed line, validates server-side)       | ☐     |
|  6 | Membership + promo booking (no double counting)                     | ☐     |
|  7 | At-home booking with travel fee (subtotal = lines, travel separate) | ☐     |
|  8 | Booking with tip (tip surfaced separately, included in total)       | ☐     |
|  9 | Deposit booking → balance paid (50% deposit, then remainder → paid) | ☐     |
| 10 | Refund / partial refund (receipt line + total_refunded surfaced)    | ☐     |
| 11 | Provider-created scheduled booking (server recompute matches UI)    | ☐     |
| 12 | Provider-created walk-in (membership separate from discount_amount) | ☐     |
| 13 | Provider app receipt download (PDF == JSON; payments table renders) | ☐     |
| 14 | Customer app receipt download (PDF == JSON; payments table renders) | ☐     |
| 15 | Provider web receipt vs admin booking detail (decomposition agrees) | ☐     |
| 16 | Admin finance spot check (no regression in `finance_transactions`)  | ☐     |
| 17 | EFT full (`bank_transfer`) — receipt labels "EFT"                   | ☐     |
| 18 | Manual card (`other` provider) — receipt labels "Card (manual)"     | ☐     |
| 19 | Wallet-only deposit on partially-paid booking — balance not zero    | ☐     |
| 20 | Custom offer full payment + receipt + finance trail                 | ☐     |

## Migrations applied

- **582** `booking_payments_wallet_gift_and_payment_status_tolerance.sql`
  - Widens `payment_method` / `payment_provider` to allow `wallet` and `gift_card`.
  - Updates `update_booking_payment_status` trigger to `paid` when `total_paid + 0.01 >= total_amount`.
  - Backfills synthetic `booking_payments` rows for historic wallet/gift settlements
    using `payment_provider_id = '<kind>_booking:<booking_id>'` (idempotent: skips if row exists).

- **583** `normalize_booking_pricing_columns.sql`
  - Pass A: rewrites legacy rows where `subtotal == lines + travel` to lines-only.
  - Pass B: strips legacy walk-in `discount_amount` that double-counted membership.
  - Pass C: rewrites legacy public-booking rows where `subtotal + discount == raw_lines`
    (created by the bug where public path baked package into `subtotal` AND stored it
    in `discount_amount`).
  - Drift guard: anything that doesn't reconcile within 1 cent lands in
    `pricing_normalization_audit` instead of being modified.
  - Idempotent: each pass's heuristic stops matching after normalization.

## Automated coverage backing this matrix

- `apps/web/src/app/api/public/bookings/__tests__/canonical-pricing-parity.test.ts` —
  proves public ↔ provider ↔ receipt readback all decompose identically across 11 scenarios.
- `apps/web/src/lib/bookings/__tests__/wallet-card-paid-status.test.ts` —
  trigger semantics + receipt builder for wallet/card and gift-card/card splits.
- `apps/web/src/lib/bookings/__tests__/ensure-wallet-gift-booking-payments.test.ts` —
  runtime helper inserts wallet/gift rows idempotently with migration-582 provider-id convention.
- `apps/web/src/lib/bookings/__tests__/migration-582-idempotency.test.ts` —
  synthetic `payment_provider_id` parity between SQL backfill and runtime helper; trigger threshold.
- `apps/web/src/lib/bookings/__tests__/outstanding-no-double-subtract.test.ts` —
  proves `computeBookingOutstandingDisplay` never double-subtracts wallet/gift after migration 582
  (covers wallet-only deposit, fully paid mix, partial refund, fully refunded, additional charges).
- `apps/web/src/lib/promotions/__tests__/promo-lifecycle.test.ts` —
  invalid / expired / used-up / location-mismatched / capped / valid promo paths; never persists stale state.
- `apps/web/src/lib/receipts/__tests__/receipt-scenarios.test.ts` —
  R60 service + R100 travel + 9% membership; deposit; full payment; wallet split; refund; promo+membership.
- `apps/web/src/lib/receipts/__tests__/payment-mix-receipt-scenarios.test.ts` —
  Yoco split, EFT full, cash deposit, manual card, two-row Yoco deposit→balance, partial refund,
  gift+card+promo, custom-offer travel, walk-in cash.
- `apps/web/src/lib/receipts/__tests__/format-payment-method-label.test.ts` —
  canonical PDF/web payment-method label mapping (Wallet, Gift card, Cash, EFT,
  Card (Yoco/manual), saved/new card, fallbacks).
- `apps/web/src/lib/receipts/__tests__/build-booking-receipt.test.ts` —
  receipt builder primitives (subtotal, platform fee fallback, payments aggregation).
- `apps/web/src/lib/bookings/__tests__/display-invariants.test.ts` —
  `reconcileReceiptTotal` + `computeBookingOutstandingDisplay` correctness.
- `apps/web/src/lib/pricing/__tests__/booking-pricing.test.ts` —
  exclusive vs inclusive tax, percentage platform fee.
- `apps/web/src/app/api/provider/bookings/__tests__/no-double-membership-discount.test.ts` —
  defensive stripping of folded membership from `discount_amount` in provider POST.

## Companion docs

- `docs/MANUAL_PAYOUT_REPORTING_VALIDATION.md` — admin/provider reporting,
  payout, commission, ledger completeness and exports matrix. Use after
  changes to finance_transactions, payout helpers, report APIs, or finance
  CSVs.

## Surfaces touched in this audit

UI / receipt fixes (Finance-truth 2026-05 final pass):

- `apps/web/src/lib/receipts/pdf-design.ts` — `formatPaymentMethodLabel` + `drawPdfPayments`.
- `apps/web/src/app/api/bookings/[id]/receipt/pdf/route.ts` — Payments table; removed
  misleading "Wallet applied: −R…" / "Gift card applied: −R…" deduction lines.
- `apps/web/src/app/api/provider/bookings/[id]/receipt/pdf/route.ts` — same fix.
- `apps/customer/app/(app)/booking-detail.tsx` — "Paid via" breakdown after total;
  share-text "Paid via" block instead of negative wallet/gift lines.
- `apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx` — same breakdown for provider mobile.
- `apps/web/src/app/account-settings/bookings/[id]/BookingsIdPageClient.tsx` —
  removed deduction lines, added "Paid via" breakdown.
- `apps/web/src/app/account-settings/bookings/[id]/receipt/BookingsIdReceiptPageClient.tsx` —
  added Payments section.

Outstanding / balance-due fixes (no double-subtract of wallet/gift on top of `total_paid`):

- `apps/web/src/lib/bookings/display-invariants.ts` — `computeBookingOutstandingDisplay`.
- `apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx` — `outstandingRawLocal`.
- `apps/web/src/components/provider/front-desk/PaymentActions.tsx` — `remaining`.
- `apps/web/src/app/api/admin/bookings/route.ts` — admin booking list outstanding.
- `apps/web/src/app/api/me/bookings/[id]/pay-remaining/route.ts` — Paystack collect-remainder amount.
- `apps/web/src/app/api/provider/bookings/[id]/mark-paid/route.ts` — provider remaining-balance gate.
