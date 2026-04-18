# Launch E2E Dry-Run (Wave 5.4)

> Run this checklist on staging exactly as written. Every box must be ticked,
> every "expected" must match, or launch is blocked. Tag the completed run
> with the commit SHA and date at the bottom.

## 0 · Pre-flight

- [ ] Deployed SHA on staging matches target launch SHA.
- [ ] `supabase db diff` clean against staging (no pending migrations).
- [ ] Sentry release created for both web and mobile (iOS + Android prod profile).
- [ ] `SENTRY_DISABLE_AUTO_UPLOAD=false` verified in staging EAS prod profile.
- [ ] Upstash rate-limit keys rotated (fresh window so limits don't carry over from QA noise).
- [ ] `CRON_SECRET` in Vercel matches the value used by curl probes below.
- [ ] DLQ drained: `select count(*) from notification_delivery_queue where status='dead_letter'` returns **0**.

---

## 1 · Booking + mixed-payment path (happy)

Create on **web** as Customer A booking Provider X.

- [ ] Hold slot (CAPTCHA solved).
- [ ] Apply a promo code + redeem 200 loyalty points + pay remainder on card via Paystack test card.
- [ ] Tip 10 % at checkout.
- [ ] Confirm booking.

**Assertions**

- [ ] `bookings.status = 'confirmed'`.
- [ ] One row in `booking_payments` for the card leg, one in `loyalty_point_transactions` (`redeemed`), one `promotion_usage` row.
- [ ] `finance_transactions` has: `payment`, `provider_earnings`, `service_fee`, `tax` (if region), `tip`, `promotion_discount`, `loyalty_redemption`, `wallet_payment` if wallet used.
- [ ] `select count(*) from v_ledger_reconciliation where abs_drift > 0.005` → **0**.
- [ ] Customer receives confirmation push + email (OneSignal direct); nothing in `notification_delivery_queue` as `failed`.
- [ ] PDF receipt URL works and hits Supabase Storage cache on second click.

## 2 · Booking path (induced failure)

Repeat scenario 1 but:

- [ ] Force wallet RPC to fail (rename the RPC or temporarily drop perms on the staging test project).
- [ ] Confirm that `booking_refunds.status` transitions `pending → failed`, never flips to `completed` incorrectly.
- [ ] Re-enable RPC, run `POST /api/provider/refunds/[id]/retry`, status goes to `completed`, wallet balance delta matches booking total.
- [ ] Re-check reconciliation: drift = **0**.

## 3 · Reschedule parity

Reschedule the booking from scenario 1 three ways:

- [ ] Customer web (`/booking/[id]/reschedule`).
- [ ] Customer mobile (`book-checkout.tsx` edit path).
- [ ] Provider portal (`/provider/bookings/[id]`) — drag-to-reschedule.

**Assertions per path**

- [ ] `booking.scheduled_at` reflects the exact slot selected in the provider's timezone (no `Z`-drift bugs).
- [ ] `check_reschedule_slot_conflict` RPC returned `false` (visible in Sentry breadcrumbs).
- [ ] No duplicate hold rows in `booking_holds`.
- [ ] Rebooked reminder notifications enqueued exactly once (dedupe via `dedupe_key`).

## 4 · Group booking + per-participant check-in

- [ ] Provider creates a group booking for 3 participants (1 walk-in, 2 paid).
- [ ] Check-in each participant from provider mobile — `booking_participants.checked_in_at` populated, row gets `checked_out_at` on check-out.
- [ ] Finance ledger only fires for the 2 paid participants; walk-in has no stray rows.

## 5 · Payout journey

- [ ] Provider requests a payout via mobile (rate-limit: request twice in a row, second attempt must 429).
- [ ] Admin marks payout as paid.
- [ ] Confirm ordering: `finance_transactions` row of type `payout` exists **before** `payouts.status = 'completed'`. The lag between insert and status update should be > 0 (visible in audit columns).
- [ ] `getAvailablePayoutBalance` returns the new balance correctly.
- [ ] Reconciliation drift = **0**.

## 6 · Notification durability

- [ ] Temporarily revoke the OneSignal API key on staging.
- [ ] Trigger a `booking_confirmed` send via `sendTemplateNotification`.
- [ ] Confirm direct send fails **and** a durable row is enqueued (status=`pending`) with a `dedupe_key`.
- [ ] Re-issue key; next `process-notification-queue` cron tick delivers it.
- [ ] Re-run the same logical event: second producer must collide on `ux_notification_queue_dedupe_active` and NOT create a duplicate row.
- [ ] Break delivery for 11 consecutive rows → confirm circuit breaker trips, Sentry event `notif.queue.circuit_breaker=true` appears.
- [ ] Push 11 rows into `dead_letter` → Sentry warning `notif.queue.dlq_alert=true` appears on next cron tick.

## 7 · Security + abuse controls

- [ ] Public booking-hold path without CAPTCHA fails with 400 — regardless of session cookie presence.
- [ ] Authenticated client with `Idempotency-Key` header re-plays a hold; second call returns the first hold's ID, not a new one.
- [ ] Global sign-out from mobile Security Settings invalidates the same user's web session within 60 s.

## 8 · Observability sweep

- [ ] `npm run test -- reconciliation-drift` passes on HEAD.
- [ ] Sentry has zero `error`-level unresolved events created during this dry-run.
- [ ] Vercel logs for `/api/payments/webhook` contain no raw `console.error` lines (logger JSON only).
- [ ] `select * from reconciliation_gate_runs order by created_at desc limit 1` → `passed = true`.

---

## Sign-off

| Field             | Value                                   |
| ----------------- | --------------------------------------- |
| Commit SHA        | _fill in_                               |
| Staging URL       | _fill in_                               |
| Dry-run start     | _UTC timestamp_                         |
| Dry-run end       | _UTC timestamp_                         |
| Drift findings    | _must be "zero drift"_                  |
| DLQ findings      | _must be "zero stuck"_                  |
| Sentry findings   | _must be "zero unresolved"_             |
| Signed off by     | Release captain name                    |

When every box on sections 1-8 is ticked and the sign-off table is filled, mark
Wave 5.4 complete in `docs/PARITY_MATRIX.md` and proceed to Wave 5.5
(`launch-runbook.md`).
