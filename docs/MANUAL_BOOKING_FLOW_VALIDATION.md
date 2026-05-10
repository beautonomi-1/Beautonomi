# Manual Booking Flow Validation

Use this matrix with `docs/MANUAL_FINANCE_VALIDATION.md` and `docs/MANUAL_PAYOUT_REPORTING_VALIDATION.md`. Finance sign-off stays anchored to persisted rows: `bookings`, `booking_services`, `booking_products`, `booking_payments`, receipts, and finance/reporting tables.

## Common Checks

For every scenario:

- Confirm UI payload matches the booking type, selected staff, location type, services, products, discounts, and payment method.
- Confirm availability is revalidated by the API before money is captured or a booking is persisted.
- Confirm status actions are based on persisted `bookings.status`, `current_stage`, `payment_status`, verification flags, and version.
- Confirm receipts and reports use stored totals and completed `booking_payments`, not wallet/gift legacy columns as extra deductions.
- Confirm provider app and provider web show the same lifecycle meaning, even if layout differs.

## Scenario Matrix

| Scenario | Setup | Action | Expected API | Expected DB Rows | Accounting | Status / UI | Receipt / Reporting |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Normal multi-service | Two services, same customer, assigned staff, no products | Customer or provider creates booking | Public/provider booking API validates full service sequence | One `bookings` row, ordered `booking_services` with per-line start/end | `subtotal` equals services; tax/fees/discounts decomposed | Pending/confirmed follows provider settings; valid next actions only | Receipt shows service lines; reports count one booking |
| Normal with products | Service plus retail product/variant | Create booking, then complete service | Booking create inserts products; completion syncs order/stock | `booking_products` with variant id, quantity, totals; stock deducted once | Product total included in `subtotal`; payment rows drive paid amount | Product does not extend service duration | Receipt and reports include product sale |
| Group booking | Parent group with multiple participants | Create group and participant bookings | Group create, provider booking create, participant link endpoint | `group_bookings`, child `bookings`, `booking_participants`, `group_booking_id` links | Group total recalculates from participant facts; link is idempotent | Group appears once in list/calendar; participants do not duplicate list rows | Group receipt shows participant/service totals |
| Recurring booking | Weekly series with finite count | Create recurring appointment | Provider recurring API creates series and initial occurrences | `recurring_appointments`; occurrence `bookings` with `recurring_series_id` | Occurrences carry pricing snapshot; payment remains pending until real payment row | Each occurrence has independent lifecycle/status | Each occurrence appears separately in reports |
| Custom offer | Customer accepts custom offer with payment | Accept/pay offer | Custom offer accept/pay routes finalize booking and message state | `bookings.custom_offer_id`, offer status, message attachments where applicable | Offer price persists to booking totals and payment rows | Booking status/payment status reflect payment result | Receipt/reporting trace back to booking |
| At-home / housecall | At-home address with PIN/QR verification | Start journey, arrive, verify, start, complete | Housecall stage routes gate sequence | `current_stage` progresses without assuming paid means started | Travel fee is separate from subtotal and included in total | Start service disabled until arrival verification is complete | Receipt shows travel fee separately |
| At-salon | Salon location booking | Confirm, check in, start, complete | PATCH/start/complete routes validate transitions | `status` and `current_stage` remain lifecycle facts | No travel fee unless explicitly configured | Check-in is arrival; start is chair/service time | Receipt/reporting unchanged by check-in |
| Walk-in / sale | Provider creates immediate service/product sale | Create paid walk-in and complete | Provider booking API supports walk-in payment method | `bookings.booking_source`/walk-in facts, products/payments as applicable | Cash/card/manual payment creates completed settlement rows | May be immediately completed when service is done | End-of-day/reporting includes sale and payment method |

## Negative Scenarios

Decision: `pending_payment` is now an active lifecycle state for customer-led new-card checkout after Paystack initialization succeeds and before a successful charge is recorded. Paystack success must move it to `confirmed` when provider confirmation is not required, or to `pending` when the provider still needs to confirm.

| Scenario | Action | Expected result |
| --- | --- | --- |
| Paid but pending lifecycle | Try provider Confirm on `status=pending`, `payment_status=paid` | Confirm is allowed; UI explains payment is settled but lifecycle still needs confirmation |
| Pending payment lifecycle | Try provider Confirm on `status=pending_payment` | Confirmation blocked; API returns `INVALID_STATUS_TRANSITION` with allowed next statuses |
| Stale booking version | Save status from stale detail screen | API returns `CONFLICT`; app rolls back optimistic state and prompts refresh |
| At-home not verified | Try Start service before PIN/QR verification | API returns `VERIFICATION_NOT_COMPLETE`; app shows PIN/QR copy |
| Terminal status | Try to change completed/cancelled/no-show | API returns structured invalid transition; UI shows no active status action |
| Group participant relink | Retry participant link for same child booking/group | API returns success with existing participant |
| Group participant wrong group | Link same child booking to different group | API returns `CONFLICT` |
| Slot taken after checkout starts | Another booking/hold appears before payment | Revalidation returns `SLOT_NO_LONGER_AVAILABLE`; no charge should be captured |
| Wallet/gift migrated payment | Booking has wallet/gift in `booking_payments` and legacy columns | Outstanding display uses max coverage, never double-subtracts |

## Evidence To Capture

- API request/response path and any error `code`/`details`.
- `bookings`: `status`, `current_stage`, `payment_status`, `total_amount`, `total_paid`, `balance_due`, `version`.
- Line rows: `booking_services`, `booking_products`, `booking_addons`.
- Payment rows: `booking_payments` with method/status/amount.
- Receipts: customer/provider receipt JSON/PDF totals.
- Reports: recorded takings, payout balance, admin finance ledger rows.
