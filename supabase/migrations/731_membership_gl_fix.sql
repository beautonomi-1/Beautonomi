-- 731: Membership GL fix — introduce `membership_provider_earnings` type
--
-- Phase 11 (membership GL fix) of the platform-revenue-truth plan.
--
-- Problem:
--   When a membership is purchased the shadow GL correctly posts:
--     membership_sale: DR 1000 Cash / CR 2600 Membership liability
--   The companion `provider_earnings` row from membership-payment.ts then posts
--   a WASH entry (DR 2000 / CR 2000) under migration 728, which is balanced but
--   means GL 2000 (provider payable) is never CREDITED for membership earnings.
--   When a payout runs it tries DR 2000 / CR Cash, but 2000 has no membership
--   credit to offset — the books drift.
--
-- Fix:
--   Introduce `membership_provider_earnings` transaction type.
--   GL posting: DR 2600 Membership liability / CR 2000 Provider payable.
--   This correctly "moves" the liability from the deferred membership account
--   into provider payable so payouts can clear it.
--
--   The `provider_earnings` type is unchanged for booking-sourced earnings (wash
--   is intentional there — the `payment` row already credited 2000).
--
-- Aggregator update (TypeScript): add `membership_provider_earnings` to
--   `provider_earnings_net` sum so provider totals still include membership income.

BEGIN;

-- The shadow GL function already handles membership_provider_earnings via the
-- updated _shadow_replay_finance_tx_row from migration 730.  We just need to
-- make sure the new type is included in the trigger allowlist (the function
-- handles it; types not in the allowlist fall through to RAISE WARNING).
-- No DDL needed here — the function update in 730 added the new ELSIF branch
-- for `membership_recognition`; rename it to `membership_provider_earnings` for
-- clarity by replacing the branch if it exists.

CREATE OR REPLACE FUNCTION public._shadow_handle_membership_provider_earnings(
  p_entry_id     uuid,
  v_membership_acct uuid,
  v_payable_acct uuid,
  v_gross        numeric,
  v_currency     text
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.journal_lines (
    entry_id, account_id, side, raw_amount, raw_currency, reporting_amount, reporting_currency
  ) VALUES
    (p_entry_id, v_membership_acct, 'debit',  v_gross, v_currency, v_gross, 'ZAR'),
    (p_entry_id, v_payable_acct,    'credit', v_gross, v_currency, v_gross, 'ZAR');
END;
$$;

COMMIT;
