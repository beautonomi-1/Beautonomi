-- =============================================================================
-- 10144_yoco_amount_cents_comment.sql
-- F-05  provider_yoco_payments.amount is BIGINT minor units (cents/kobo),
--        unlike NUMERIC major columns elsewhere. Do not rename in place
--        (callers and ledger already convert via yocoStoredAmountToMajor /
--        fromMinorUnits). Document the unit on the column.
-- =============================================================================

COMMENT ON COLUMN public.provider_yoco_payments.amount IS
  'BIGINT minor units (cents/kobo). Convert with fromMinorUnits / yocoStoredAmountToMajor. Not NUMERIC major currency.';
