# Booking flows — manual E2E matrix (Phase 6)

Run on **web**, **customer app**, and **provider app** after staging has migrations `1029`–`1031`, `1033`–`1038` (no `1032` file).

## Standard booking

- [ ] Full online payment (Paystack tenant)
- [ ] Deposit-only payment; remainder via pay-remaining
- [ ] Forced group create failure rolls back slot, wallet/loyalty/gift card, and entitlement (if used)

## Reschedule

- [ ] Customer app: in-place reschedule for booking **with** assigned staff
- [ ] Booking **without** staff: existing flow unchanged
- [ ] Non-primary group participant: still blocked on single-booking reschedule
- [ ] Primary: group reschedule via group detail

## Custom offers

- [ ] `changes_requested`: pay blocked (web + customer + provider views)
- [ ] Provider updates quote; customer pays on web checkout (flag on)
- [ ] Late success webhook on wrong status: auto-refund once (Paystack); repeat webhook idempotent
- [ ] Stripe tenant: same stale-payment refund path

## Group booking — primary pays all

- [ ] One service line per participant service (no duplicates)
- [ ] Provider calendar create respects `group_booking_enabled`
- [ ] Guest invite link opens roster (no split)

## Group booking — split (`group_split_payment_enabled`)

- [ ] Split toggle only when provider opted in + online pay
- [ ] Guest pays share; primary sees share status; provider re-send invite
- [ ] Guest cancels spot; primary repriced; refunds per payer
- [ ] Primary pays remainder; guest overpay guard refunds guest card once
- [ ] Full group cancel: guest shares to original card; primary wallet excludes guest money
- [ ] Guest share pay: provider earnings / `finance_transactions.payment` with `source_payment_id`
- [ ] Guest share webhook redelivery: ledger backfill without double participant credit
- [ ] Split cancel: cancel-preview wallet/fee matches wallet credit after cancel
- [ ] Stale custom offer (Stripe tenant): card refunded; `stale_payment_refunds` completed or retried

## Product orders

- [ ] Unpaid Paystack order: provider cannot advance fulfilment
- [ ] Partial refund: order stays active, stock not fully restocked
- [ ] Partially refunded order: cancel hidden/blocked; **Refund remaining** closes tender
- [ ] Full refund: terminal + restock
- [ ] Quote totals match checkout create (`POST /api/me/orders/quote` vs order create)

## Regression smoke

- [ ] Provider app custom offer photo upload (`files` field)
- [ ] Lists show custom-offer badge where applicable
