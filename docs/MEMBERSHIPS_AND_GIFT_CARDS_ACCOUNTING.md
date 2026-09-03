# Memberships and gift cards — accounting

Wash-at-sale for provider-sold salon memberships is intentional. Gift cards are a platform liability until redeemed or broken.

## Memberships (`user_memberships`)

At purchase / renewal, `recordMembershipPayment` posts:

| Type | GL | Meaning |
| --- | --- | --- |
| `membership_sale` | CR 2600 | Gross collected (liability / contra to cash) |
| `membership_provider_earnings` | DR 2600 / CR 2000 | Provider net, withdrawable after payout hold |

The platform takes no commission. The provider delivers the discount over the term, so **we do not ratably recognize membership revenue**. `recognize_period_revenue` does not target membership sale rows. Dashboard, recognized revenue, and available payout all include `membership_provider_earnings` (with the standard hold).

Plan changes are **no proration**: `scheduled_plan_id` + `scheduled_change_at` (normally `expires_at` / `next_billing_at`). `applyScheduledMembershipPlanChange` runs in `process-membership-renewals` immediately before the renewal charge so the new plan price is billed.

Refunds call `reverseMembershipPayment`: component refunds for `membership_sale` and `membership_provider_earnings`, then `user_memberships.status = cancelled` and `refunded_at`.

Pause (`POST /api/me/membership/pause`) sets `status = paused` and skips auto-renew until resume.

## Gift cards (platform-wide)

| Event | Type | GL |
| --- | --- | --- |
| Purchase | `gift_card_sale` | CR 2400 liability |
| Redeem on booking | `gift_card_payment` | DR 2400 |
| Expiry | `gift_card_breakage` | DR 2400 / CR breakage revenue |
| Unspent order refund | `gift_card_refund` | DR 2400 / CR cash |

`expires_at` is set at issuance from `platform_settings.gift_cards.validity_months` (default 36, SA CPA guidance). Cron `recognize-gift-card-breakage` posts breakage for expired unused balances. Cron `gift-card-expiry-reminders` notifies at 30 / 7 days.

`reverseGiftCardOrder` voids unredeemed cards and refuses a full refund when any card was spent (remaining balance only).

Provider-issued gift cards (settings from migration 577) are a later phase.

## Analytics

Server events (Amplitude `insert_id = ${reference}:${event}`): `membership_purchased`, `membership_renewed`, `membership_cancelled`, `gift_card_purchased`, `gift_card_redeemed`.
