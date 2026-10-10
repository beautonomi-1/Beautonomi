# Loyalty & provider points — follow-up backlog

Tracked items intentionally out of scope for migration 978 and the related app fixes.

## Customer loyalty

- **Points expiry:** `points_expiry_days` in `loyalty_point_config` is not applied on earn (`expires_at` is always null). No cron posts `expired` ledger rows.
- **Bonus multipliers:** Seed `bonus_multipliers` / `earning_rate` on config are unused; booking earn uses `loyalty_rules.points_per_currency_unit` only.
- **Production repair:** Bookings double-clawed before 978 may need a one-off support SQL runbook (negative ledger sum hidden by `get_customer_available_points` floor).
- **Custom offer quote UI:** `splits.loyaltyDiscountAmount` may be 0 while `pricing` includes loyalty (by design to avoid double-counting collectible).
- **Compliance resets:** Older tenant-reset migrations may reference dropped `loyalty_point_transactions`.
- **Admin adjust:** No API to post manual loyalty `adjusted` rows for support.

## Provider points

- **Historical backfill:** `backfill_provider_point_transactions` uses fixed amounts, not current `provider_point_rules`.
- **`current_tier_points`:** Display field is never updated.
