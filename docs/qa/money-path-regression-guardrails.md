# Money-path regression guardrails

Use this checklist before merging any money-path change. All items must hold unless the change is an intentional, tested product decision.

## Invariants (must never break)

1. **Append-only ledger** — Never update `finance_transactions` in place; post adjustment rows.
2. **No double-count wallet/gift** — Do not subtract `wallet_amount`/`gift_card_amount` when `total_paid`/`amount_paid` already includes completed wallet/gift (`booking` migration 582 semantics).
3. **Product order due** — Card charge amount must use `total − wallet − gift − priorSuccessfulCardPayments`, not raw `total_amount`.
4. **Fail closed** — If prior card payments cannot be loaded, do not charge/collect (return null due / `PAYMENT_LOOKUP_FAILED` / refuse initialize).
5. **Provider-collected vs platform-held** — Till remainder is not platform payout; Paystack/wallet/gift product orders are not retail POS takings.
6. **Gift capture before paid** — Product orders and till sales must not mark paid when gift capture fails (unless other tender fully covers).
7. **Booking-collection sales** — Settle booking; exclude from POS revenue and stock.
8. **Partial card** — Record partial `payment_transactions`; leave entity unpaid until coverage meets total.

## Golden tests (run every time)

From `apps/web`:

```text
npx vitest run src/lib/money-flow/__tests__/money-path-golden-invariants.test.ts
```

## Bundles by change type

### Amount due / guards / `amount_still_due`

```text
npx vitest run src/lib/payments/__tests__/product-order-paystack-charge-allowed.test.ts src/lib/payments/__tests__/paycloud-amount-guards.test.ts src/lib/orders/__tests__/product-order-tender.test.ts
```

### Bookings outstanding / receipts

```text
npx vitest run src/lib/bookings/__tests__/outstanding-no-double-subtract.test.ts src/lib/receipts/__tests__/build-booking-receipt.test.ts src/lib/receipts/__tests__/payment-mix-receipt-scenarios.test.ts
```

### Product order payment + reporting

```text
npx vitest run src/lib/orders/__tests__/record-product-order-payment.test.ts src/lib/reports/__tests__/provider-retail-takings.test.ts src/lib/reports/__tests__/recorded-takings.test.ts src/lib/receipts/__tests__/build-order-receipt.test.ts
```

### Till / Yoco / sale gift

```text
npx vitest run src/lib/payments/__tests__/yoco-apply-successful-settlement.test.ts src/lib/payments/__tests__/settle-yoco-payment.test.ts src/lib/payments/__tests__/settle-paycloud-payment.test.ts
```

### Payout balance

```text
npx vitest run src/lib/provider/__tests__/available-payout-balance.test.ts src/lib/provider/__tests__/available-payout-balance-scenarios.test.ts src/lib/provider/__tests__/available-payout-balance-product-orders.test.ts
```

### Card-machine product-order full refund

```text
npx vitest run src/lib/payments/__tests__/reverse-card-machine-product-order.test.ts
```

### Provider mark-collected

```text
npx vitest run src/app/api/provider/product-orders/[id]/mark-collected/__tests__/route.test.ts
```

### Gift redemption report

```text
npx vitest run src/lib/reports/__tests__/gift-card-provider-redemptions-fetch.test.ts src/lib/reports/__tests__/gift-card-provider-redemptions-scope.test.ts
```

### Paystack webhook product-order race guard (late charge.success after cancellation)

```text
npx vitest run src/app/api/payments/webhook/_handlers/__tests__/charge-success-product-order-late-success-refund.test.ts
```

## Fix policy

- Fix only **proven** gaps (failing test or invariant contradiction in code review).
- Each fix: one invariant, minimal diff, new/updated test, run bundles above for touched area.
