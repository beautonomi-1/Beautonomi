# Refunds and Disputes

## Admin refunds queue (`/admin/refunds`)

### Purpose

Cancelled bookings are **refunded to the customer wallet automatically** via cancellation policy. The admin refunds page is an **exception queue** — it surfaces bookings where something went wrong or a manual support credit is needed. It is not a list of every successful payment.

### What the page shows

- **One row per booking** (not per gateway capture row). Walk-in extras and base payments collapse into a single booking row.
- **Needs action** — real exceptions: failed auto-credits, stuck pending refunds, overdue cash confirmations, open disputes, refund support tickets, or cancelled bookings where money was never returned.
- **Explained** — cases that look like leftovers but are not actionable: retained cancellation fees, voided gift-card legs, cash refunds awaiting customer confirmation, completed in-progress bookings.
- **Why column** — plain-English reason derived from booking status, refund records, disputes, and policy signals.
- **Paid with** — tender label from gateway provider or in-person `booking_payments` (Paystack, PayCloud, Yoco, cash, wallet, gift card, mixed).

In-person bookings (cash / card machine) that never created a `payment_transactions` row appear when they need review, via a booking-tender queue row.

### Who can do what

| Who | What |
|-----|------|
| **Finance admin** | Opens `/admin/refunds`, reviews Needs action, credits wallet when appropriate. |
| **Finance admin** | Uses **Credit wallet** on processable rows — never reverses card/bank; customer receives wallet balance. |
| **Nobody** | Cannot process rows marked explained (retained fee, gift void, awaiting cash confirm). |

### Credit wallet flows

1. **Gateway capture** — `POST /api/admin/refunds/[transactionId]` via `issueAdminWalletRefund`. Claims the charge row, credits wallet with idempotency key, syncs all charge rows on the booking, warns if provider balance goes negative after payout.
2. **In-person / no capture row** — `POST /api/admin/refunds/booking/[bookingId]` with `bookingTenderMode`. Same safety rail; refuses when a gateway capture still exists.

Do **not** use `POST /api/admin/bookings/[id]/refund` from this page — it lacks idempotency, gift-card handling, provider warnings, and incorrectly cancels the booking on full refund.

### Sidebar badge

The `/admin/refunds` nav badge counts **bookings needing review** (`countRefundsNeedingReview`), matching the Needs action tab — not every successful gateway capture.

### Reconciliation

`GET /api/admin/refunds/reconciliation` (read-only) lists stale `payment_transactions` rows where `refund_amount` lags `bookings.total_refunded`, and in-person bookings with refunds but no gateway capture. Optional backfill uses `syncPaymentTransactionRefundState` — never credits wallets.

---

## Refunds: wallet-first policy

All customer refunds credit the **Beautonomi wallet** instead of reversing the original card/bank payment.

- **Customers** spend the balance on their next booking or request a payout.
- **Providers** are clawed back via ledger triggers when refunds complete; admin may see a provider balance warning if payout already happened.

### Write paths and sync

- **Cancellation** — auto wallet credit; `syncPaymentTransactionRefundState` aligns all gateway charge rows.
- **Provider refund** — store_credit, cash, or terminal (`original`); non-wallet paths now sync gateway rows after completion.
- **Terminal reversal** — `reverseCardMachineSettlement` syncs after `booking_refunds` insert.
- **Cash confirmation** — `finalizeCashRefund` syncs when customer confirms (or auto-finalises after 48h).

Coverage signals (`giftCardVoidedTotal`, `retainedFeeTotal`, `reservedPendingTotal`) are **display/classification only** — they are not folded into `effectiveRefundedTotal`, which drives refund gates.

---

## Disputes: no self-service “raise dispute”

There is **no** customer or provider action that directly opens a **booking dispute**. Disputes are opened only by admins after review.

- **Customers and providers** can contact support; an admin opens a formal dispute via `POST /api/admin/bookings/[id]/dispute`.
- **Resolution** — `POST /api/admin/bookings/[id]/dispute/resolve` with refund_full/refund_partial credits wallet via the shared admin refund rail.

Open disputes appear on the refunds queue with reason **open_dispute** — resolve on the dispute page, not by crediting wallet blindly.
