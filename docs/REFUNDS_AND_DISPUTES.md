# Refunds and Disputes

## How /admin/refunds works (who does what)

**Page:** `/admin/refunds` — **Refunds Management** (superadmin only).

### What the page shows

- **Data source:** Rows are **payment_transactions** that either have `transaction_type = 'refund'` or `refund_amount` set (i.e. original charges that were refunded, or refund-type transactions). So you see both “charge” transactions that have been refunded and any separate “refund” records.
- **Filters:** Search by booking number / customer / reference; filter by status (all, success, failed, pending, refunded, partially_refunded).
- **Tabs:** All, Refunded, Pending, Failed — same list, filtered in the UI.
- **Each row:** Booking number, amount, customer, provider, status badge, refund amount/reason/date and “refunded by” user when already processed.

### Who can do what

| Who | What |
|-----|------|
| **Superadmin** | Opens `/admin/refunds`, sees the list, uses filters/tabs and search. |
| **Superadmin** | Clicks **Process Refund** on a row that is **not** yet refunded (status is success, failed, or pending). |
| **Nobody** | Cannot “process” a transaction that is already refunded or partially_refunded (button is hidden). |

### What “Process Refund” does (when superadmin clicks it)

1. **Dialog:** Admin enters **refund amount** (defaults to full transaction amount) and **refund reason** (required), then clicks **Process Refund**.
2. **API:** Frontend calls **POST /api/admin/refunds/[id]** with `{ refund_amount, refund_reason }`. The `[id]` is the **payment_transaction** id (the row they clicked on).
3. **Backend (POST /api/admin/refunds/[id]):**
   - Validates amount and that the transaction is not already refunded.
   - Loads the booking for that transaction to get **customer_id**.
   - **Credits the customer’s wallet** via `wallet_credit_admin` (refund amount).
   - Updates the **payment_transaction**: sets `refund_amount`, `refund_reason`, `refunded_at`, `refunded_by`, `status` (refunded or partially_refunded), `refund_reference`.
   - Inserts a **booking_refund** (store_credit, completed) so booking totals (e.g. total_refunded) stay in sync.
   - Writes an **audit log** and sends the customer a **notification** (“Refund added to wallet…”).
4. **Result:** Customer’s wallet balance goes up; they can use it for the next booking or request a payout. The row on `/admin/refunds` now shows as refunded/partially_refunded and the Process button disappears.

### Summary

- **List:** GET `/api/admin/refunds` → payment_transactions (refund type or with refund_amount), with booking + customer + provider + refunded_by user.
- **Process:** POST `/api/admin/refunds/[id]` → wallet credit for customer + update that transaction + create booking_refund + notify. No Paystack (or other gateway) call; refund is always wallet credit.

---

## Refunds: always credit wallet

All refunds (admin refunds page, booking refund, payment transaction refund, dispute resolution) **credit the customer’s wallet** instead of refunding to the original payment method (e.g. card via Paystack).

- **Customers** can use the balance for their next booking or **request a payout** when they want.
- **Providers** are not credited on refunds; the refund is to the customer. Provider earnings for that booking are effectively reversed by the refund (booking totals and payment status are updated).

This keeps one consistent flow for every payment type (Paystack, wallet, gift card, etc.) and avoids gateway-specific refund logic.

### Implementation

- **Admin Refunds page (Process)** – `POST /api/admin/refunds/[id]`: credits customer wallet, updates `payment_transactions`, inserts `booking_refunds` (store_credit), notifies customer.
- **Admin booking refund** – `POST /api/admin/bookings/[id]/refund`: credits customer wallet, inserts `booking_refunds` (store_credit), updates booking status if full refund.
- **Payment transaction refund** – `POST /api/admin/payments/[txId]/refund`: credits customer wallet (no Paystack call), updates transaction and booking, inserts `booking_refunds`, ledger and notifications.
- **Dispute resolve** – `POST /api/admin/bookings/[id]/dispute/resolve`: when resolution is refund_full/refund_partial, credits customer wallet, inserts `booking_refunds`, optionally marks `payment_transactions` as refunded; works even when there is no Paystack transaction.

---

## Disputes: no self-service “raise dispute”

There is **no** customer or provider action that directly opens a **booking dispute**. Disputes are opened only by admins after review.

- **Customers and providers** can:
  - **Contact support** (support ticket) to describe the issue and ask for help.
  - Rely on an **admin** to open a formal dispute from the admin side after reviewing the case.

- **Admins** open a dispute via **POST /api/admin/bookings/[id]/dispute**. Only then can the dispute be resolved (refund_full, refund_partial, or deny) via the dispute resolve endpoint.

This is intentional: it reduces frivolous disputes and ensures each dispute is reviewed before it is created. The `booking_disputes.opened_by` column supports `'customer' | 'provider' | 'admin'` for future use if you add a self-service “raise dispute” flow later.
