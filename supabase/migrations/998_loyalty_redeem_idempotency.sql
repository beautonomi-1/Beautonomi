-- 998: Self-service loyalty redemption idempotency
--
-- POST /api/me/loyalty/redeem debits points (append_loyalty_ledger_entry) and then
-- credits the wallet. A double-tap or client retry ran both steps twice. The route
-- now tags each redemption with a client-supplied key in
-- metadata.redeem_idempotency_key; this index makes a second debit with the same
-- key fail (unique_violation), so concurrent duplicates cannot both deduct points.
-- The advisory lock in append_loyalty_ledger_entry serialises calls per customer
-- but does not dedupe them.

CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_ledger_redeem_idempotency_key
  ON public.loyalty_points_ledger (customer_id, (metadata->>'redeem_idempotency_key'))
  WHERE transaction_type = 'redeemed'
    AND metadata ? 'redeem_idempotency_key';
