# Additional Charges & Payout Rules

This document defines how additional charges (booking add-ons or product/retail sold during a visit) are recorded and how they affect financial reporting and payouts.

---

## 1. Model & scope

- **Additional charges** are linked to a **booking** (`additional_charges.booking_id`). They can represent extra services or product/retail sold during that visit; use `description` (and any future type/category) to distinguish.
- **Single source of truth for earnings and payouts:** `finance_transactions`. Use it for payout balance, provider finance/reports, and admin analytics. Use `bookings.total_amount` / `total_paid` for booking-level UX only.

---

## 2. Payment flows (who holds the money)

| Scenario | Record in `booking_payments` | Create `finance_transactions` | Affects payout balance? |
|----------|------------------------------|-------------------------------|--------------------------|
| **Online (Paystack)** – customer pays via redirect/checkout | Yes (via webhook/flow) | Yes (`additional_charge_payment` + `provider_earnings`) | Yes |
| **Card on file** – platform charges saved card after customer approval | Yes (via `settleAdditionalChargePlatformHeld`) | Yes (`additional_charge_payment` + `provider_earnings`) | Yes |
| **Paystack Terminal** – terminal payment allocated to additional charge | Yes (via `settleAdditionalChargePlatformHeld`) | Yes (`additional_charge_payment` + `provider_earnings`) | Yes |
| **Walk-in at salon** – provider takes cash or Yoco | Yes (mark-paid API) | Yes (`walk_in_additional_charge` – audit/reporting only) | No |

**Rule:** If the platform (or Paystack) holds the money -> create ledger rows that count toward payout. If the provider took payment directly (cash/Yoco at salon) -> record the payment and create an audit ledger row only; **do not** add to payout balance.

**No extra platform fee on additional charges:** The charge amount is treated as pure service revenue. Platform earns only via commission (same rate as the original booking). No extra customer surcharge is added.

---

## 2a. Settlement decision framework (smart default)

The system recommends a settlement action based on the booking's context. Providers can always override.

| Booking source | Original tender | Customer has saved card? | Recommended action |
|---|---|---|---|
| `walk_in` | any | any | `collect_in_person` |
| `online` | `paystack` (card) | Yes | `charge_card_on_file` (consent-gated) |
| `online` | `paystack` (card) | No | `customer_pay` |
| `online` / `provider` | `cash` / `wallet` | any | `collect_in_person` |
| `provider` (non-cash) | `paystack` | any | `customer_pay` |

**Consent rule:** `charge_card_on_file` only fires **after** the customer explicitly approves the specific charge (one tap in-app or web). The platform cannot silently charge. `collect_in_person` bypasses approval because the provider attests physical presence.

**State machine:**
```
pending -> approved (customer approves) -> paid (customer pays in-app OR card-on-file)
pending -> rejected (customer rejects) -> paid (provider collects in person as fallback)
pending -> paid (provider marks paid in-person or terminal allocation)
```

The resolver is implemented in `apps/web/src/lib/bookings/resolve-additional-charge-settlement.ts` and returned by `GET /api/provider/bookings/[id]/additional-charges` as `settlementPlan`.

---

## 3. Ledger transaction types

- **`provider_earnings`** – Provider's share of revenue (after commission). **Included** in available payout balance when the payment went through the platform (e.g. Paystack). Excluded when booking is walk-in and payment was cash/Yoco (provider already has the money).
- **`additional_charge_payment`** – Platform commission on an online/card-on-file/terminal additional charge. Admin/finance only.
- **`walk_in_additional_charge`** – Audit/reporting only. Created when a provider marks an additional charge as paid (cash/card/Yoco at salon). **Not** included in `getAvailablePayoutBalance`; used so reports can show total revenue including walk-in add-ons.

---

## 4. Booking totals

- **`total_amount`** – Updated when an additional charge is paid (online or walk-in) so that "booking total" = services + all additional charges. Keeps receipts and outstanding logic consistent.
- **`total_paid`** – Sum of all `booking_payments` (main + additional charges), maintained by the `update_booking_payment_status` trigger.

---

## 5. Payout balance

- **Available balance** = sum of `provider_earnings` (net) where the platform held the money, minus completed payouts and pending payout requests.
- Walk-in earnings (cash/Yoco) and `walk_in_additional_charge` are **excluded** from payout balance because the platform never held those funds.

---

## 6. Implementation notes

- **Mark-paid (additional charge):** Inserts into `booking_payments`, updates `additional_charges.status` and `bookings.total_amount`, and inserts one `finance_transactions` row with `transaction_type = 'walk_in_additional_charge'`.
- **Card-on-file / Terminal settlement:** Both call `settleAdditionalChargePlatformHeld` which inserts `additional_charge_payment` + `provider_earnings` into `finance_transactions` and is idempotent on the `payment_transactions(provider, reference)` unique constraint.
- **getAvailablePayoutBalance:** Only sums `provider_earnings` and `payout`; no change needed for `walk_in_additional_charge`.
- **Provider finance API:** Returns `provider_earnings`-based totals for payoutable earnings and `walk_in_additional_charges_total` / `walk_in_additional_charges_this_period` for full revenue visibility; both appear in the transaction list.

---

## 7. Platform coverage

| Platform | Additional-charge actions | Finance / walk-in display |
|----------|---------------------------|----------------------------|
| **Web (provider)** | Booking detail: request payment, settlement plan hint, "Send to client" per charge, "Mark paid" (walk-in). Finance page: revenue streams include "Walk-in add-ons". | Yes |
| **Provider app** | Booking detail: request payment, settlement plan hint, "Send to client" per charge, "Mark paid" per charge. Finance overview: shows "Walk-in add-ons (this period)". | Yes |
| **Customer (web)** | Account booking detail: view, approve, reject, and pay additional charges (Paystack redirect). | N/A (no walk-in) |
| **Customer app** | Booking detail: approve, reject, "Pay now" (Paystack redirect), "Pay with saved card" (card-on-file, requires approved status). | N/A |

All platforms use the same backend: mark-paid updates `bookings.total_amount` and creates `walk_in_additional_charge` ledger rows; `settleAdditionalChargePlatformHeld` handles all platform-held tenders (card-on-file, terminal) ensuring identical commission/earnings accounting.

---

## 8. Idempotency

All platform-held settlement paths (webhook, card-on-file, terminal) flow through `settleAdditionalChargePlatformHeld`, which uses the unique `payment_transactions(provider, reference)` constraint as the idempotency guard. Concurrent or retry calls with the same reference return `alreadySettled: true` without writing duplicate ledger rows.

---

## See also

- [REDIRECTS_BY_PLATFORM.md](./REDIRECTS_BY_PLATFORM.md) - Payment and WebView flows.
- [PROVIDER_WEB_VS_MOBILE_AUDIT.md](./PROVIDER_WEB_VS_MOBILE_AUDIT.md) - Provider web vs mobile.
