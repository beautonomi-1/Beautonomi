# Refund Accounting Matrix

Refund handling must create one and only one clawback path per completed refund.

## Booking Refunds

| Flow | Refund source | Ledger authority | Duplicate prevention | Payout effect |
| --- | --- | --- | --- | --- |
| Paystack booking refund | Paystack refund webhook or admin verification | `booking_refunds` plus refund ledger trigger | Gateway reference and refund row uniqueness | Negative `refund` row reduces provider balance immediately |
| Yoco booking refund | Yoco refund webhook | `booking_refunds` plus refund ledger trigger | Yoco refund/payment reference | Negative `refund` row reduces provider balance immediately |
| Cash/manual booking refund | Provider/admin manual refund action | `booking_refunds` plus refund ledger trigger | Stable manual refund reference/idempotency key | Negative `refund` row visible as clawback; if original money was provider-held walk-in, reports label it as cash-register reversal |
| Partial booking refund | Same as rail used | One `booking_refunds` row per completed partial refund | Refund reference per partial refund | Clawback equals refunded amount, including after payout |
| Refund after payout | Same as rail used | Same trigger path | Same as rail used | Can create negative raw payout balance until recovered |

## Product Refunds

| Flow | Refund source | Ledger authority | Duplicate prevention | Payout effect |
| --- | --- | --- | --- | --- |
| Paystack product order refund | Paystack/admin refund | Product-order-specific reversal ledger | Gateway refund reference | Reverses product provider earnings/platform fee where originally platform-held |
| Cash/COD/POS product refund | Provider marks product order refunded | Product order status plus provider-collected reversal/audit row | Stable product refund reference/idempotency key | Not platform payoutable; affects POS/end-of-day reporting |

## Liability Reversals

| Flow | Reversal source | Ledger authority | Duplicate prevention | Payout effect |
| --- | --- | --- | --- | --- |
| Wallet top-up reversal | Payment gateway/admin | `wallet_topups` and `wallet_transactions` | Top-up reference | No provider payout impact until wallet is spent |
| Gift-card purchase reversal | Payment gateway/admin | `gift_card_orders`, `gift_cards`, and `gift_card_sale` reversal reporting | Gift-card order/reference | Reduces gift-card liability, not provider payout |
| Gift-card booking refund | Booking refund path plus card balance restoration when applicable | `booking_refunds`, `gift_card_redemptions`, and gift-card balance | Refund reference and redemption id | Provider clawback through booking refund, liability restored separately |

## Release Gate

Every new refund endpoint or webhook branch must answer:

- What stable refund reference prevents duplicates?
- Which row is the canonical completed refund row?
- Does the flow reduce provider payout balance, cash register totals, liability, or all three?
- What happens when the refund is retried after the payout has already completed?
