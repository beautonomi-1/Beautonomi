# Payment Accounting Contract

This contract defines how Beautonomi records money movement and which tables are authoritative for payout and reporting decisions.

## Source Of Truth

- `booking_payments` records collected payment events for bookings. Non-Paystack completed rows trigger booking payment totals and the operational finance ledger.
- `payment_transactions` records external gateway references and idempotency. Paystack references are unique by `(provider, reference)`.
- `finance_transactions` is the operational ledger for provider payoutable balance, provider finance, and most revenue reports.
- `journal_entries` and `journal_lines` are the shadow double-entry ledger. They are reconciliation controls and are not yet the provider payout source of truth.
- `payouts` records payout requests and settlement status. Completed payouts must also have one `finance_transactions` row with `transaction_type = 'payout'`.

## Provider Payoutable Balance

Provider payoutable balance is computed by `getAvailablePayoutBalance` from `finance_transactions`, not from `bookings.total_amount`, `bookings.total_paid`, or `providers.total_earnings`.

Included transaction types:

- `provider_earnings`
- `tip`
- `travel_fee`
- `service_fee`
- `cancellation_fee`
- `refund`
- `payout`

Rules:

- `provider_earnings`, `tip`, `travel_fee`, and `service_fee` are added when the platform holds the money.
- `refund` rows are clawbacks and reduce the balance through their negative `net` or `amount`.
- `payout` rows are completed payout deductions and are subtracted by amount.
- Pending and processing rows in `payouts` are reserved and subtracted.
- `provider_earnings` newer than the configured payout hold period are deferred; refunds are never deferred.
- Exclusion is by **settling tender, not `booking_source`**. A booking is excluded from platform-held payout balance when every completed `booking_payments` row is a provider-collected tender (`cash`, `manual`, `yoco`, `bank_transfer`, `other`) — the provider already holds that money. This applies regardless of whether the booking is `walk_in`, `provider`, or `online`.
- A booking is included when it has at least one platform-held tender (`paystack`, `stripe`, `flutterwave`, `wallet`, `gift_card`), because the platform/gateway holds the money. Walk-in Paystack and wallet/gift-card bookings therefore remain payoutable.

Excluded rows are still important for audit, liability, or revenue reporting, but are not directly payoutable by themselves:

- `payment`
- `tax`
- `platform_fee`
- `wallet_payment`
- `gift_card_payment`
- `gift_card_sale`
- `gift_card_liability_reduction`
- `promotion_discount`
- `membership_discount`
- `loyalty_discount`
- `loyalty_redemption`
- `membership_sale`
- `provider_subscription_payment`
- `provider_ads_payment`
- `manual_adjustment` unless explicitly designed as provider payable adjustment
- `walk_in_additional_charge` unless explicitly included by a product decision

## Payment Rails

Paystack booking payments are application-settled in webhook/verify handlers. The database trigger skips Paystack booking payment rows to avoid duplicate ledger entries.

Cash, Yoco, and other in-salon booking collections settle through `booking_payments`; the database trigger creates proportional `finance_transactions` rows for non-Paystack completed payments.

Wallet and gift card booking spend must affect provider earnings through the booking settlement ledger. Wallet top-ups and gift card purchases are liability movements until spent or redeemed.

Wallet top-ups use `wallet_topups` and `wallet_transactions` as the liability roll-forward source of truth. They are not provider payoutable and must not create `provider_earnings`.

Gift-card purchases create `gift_card_sale` rows for cash-in/liability reporting. Gift-card redemption creates `gift_card_payment` provider-payable rows when the card is spent on a booking. The existing `gift_card_liability_reduction` operational row is intentionally excluded from shadow posting because `gift_card_payment` already debits the gift-card liability and credits provider payable; posting both would double-reduce the liability in GL.

Product orders must use one canonical payment recording helper for every collected payment rail. Customer cash/card-on-delivery and walk-in POS collection must be either ledgered through that helper or explicitly excluded from ledger-based provider finance reports.

## Refunds

Every completed booking refund must create exactly one clawback path. The preferred booking path is `booking_refunds` with the finance ledger trigger. Product order refunds use product-order-specific ledger reversal logic.

The booking refund trigger reverses **every recognised component proportionally** (refund amount ÷ `total_amount`): `provider_earnings`, `tip`, `travel_fee`, `platform_fee`, `tax`, `payment` commission, `cancellation_fee`, `walk_in_additional_charge`, and `additional_charge_payment` commission are penny-balanced so the cash-affecting reversal rows sum exactly to `-refund_amount`. `promotion_discount`, `membership_discount`/`loyalty_discount`, `wallet_payment`, `gift_card_payment`, and `gift_card_liability_reduction` are reversed as parallel rows (not part of the cash penny-balance). Idempotency is via the unique `(source_refund_id, refund_component)` index.

Webhook retries, customer return-page verification, admin retries, and provider double taps must be idempotent at the database or stable-reference level.

## Reporting Labels

Reports must distinguish:

- payoutable platform-held balance,
- gross sales,
- cash register/end-of-day collection,
- liability movement,
- provider earnings,
- platform revenue and fees.

### "Recognized revenue" vs "period earnings" vs "available to withdraw"

These three figures are deliberately different and must not be conflated in UI copy:

- **Recognized revenue** (provider dashboard, `get-provider-dashboard.ts`): all earned revenue in the period — `provider_earnings` + `tip` + `travel_fee` + `cancellation_fee` + `walk_in_additional_charge`. This includes provider-collected in-person add-ons because they are earned and inflate `bookings.total_amount`, even though the platform never held that cash.
- **Period earnings** (Finance API, `/api/provider/finance`): `total_earnings` is **`provider_earnings` only**. Walk-in additional charges are surfaced separately as `walk_in_additional_charges_total` (audit/reporting), not folded into `total_earnings`.
- **Sales history `provider_net`** (`provider-sales-history.ts`): reconciles against `gross_total` (= `bookings.total_amount`) per row and therefore **does** include `walk_in_additional_charge` so gross and net tie out.
- **Available to withdraw** (`getAvailablePayoutBalance`): excludes every provider-collected tender (see Provider Payoutable Balance) and so excludes `walk_in_additional_charge` and any cash/Yoco/manual booking. This is always ≤ recognized revenue.

UI surfaces must label these distinctly (e.g. "Revenue earned" vs "Available to withdraw") so a provider never reads recognized revenue as withdrawable cash.

`providers.total_earnings` is denormalized historical payout information and must not be presented as payoutable balance.

---

## Additional Charge Settlement Matrix

Additional charges on existing bookings can be settled via multiple tenders. The accounting rule is based on **who holds the money**, not on the booking source.

| Tender | Accounting path | Payout-eligible? |
|---|---|---|
| Paystack online (redirect/checkout) | `handleAdditionalChargeSuccess` in webhook | Yes |
| Paystack card-on-file (`charge-saved-card` with `additional_charge_id`) | `settleAdditionalChargePlatformHeld` | Yes |
| Paystack Terminal (terminal allocation with `entity_type: "additional_charge"`) | `settleAdditionalChargePlatformHeld` | Yes |
| Cash / manual card / Yoco (provider marks paid) | `record_walk_in_additional_charge_payment` RPC | No |

All platform-held paths write `additional_charge_payment` (commission) + `provider_earnings` (provider share) into `finance_transactions`. The idempotency guard is the unique `payment_transactions(provider, reference)` constraint — any path that re-runs with the same reference returns early (`alreadySettled: true`) without double-writing ledger rows.

### Consent rule

Card-on-file charges for additional (variable, after-the-fact) amounts require explicit customer approval before the platform can charge. The customer must set the charge status to `approved` via `POST /api/me/bookings/[id]/approve-payment` before `charge-saved-card` will proceed. This is enforced server-side; the client cannot bypass it.
