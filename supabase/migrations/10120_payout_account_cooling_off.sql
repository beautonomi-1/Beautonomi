-- ============================================================================
-- 10120: Payout account cooling-off period
-- ============================================================================

ALTER TABLE public.provider_payout_accounts
  ADD COLUMN IF NOT EXISTS cooling_off_until timestamptz,
  ADD COLUMN IF NOT EXISTS cooling_off_ready_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_provider_payout_accounts_cooling_off
  ON public.provider_payout_accounts (cooling_off_until)
  WHERE cooling_off_until IS NOT NULL;

UPDATE public.platform_settings
SET settings = jsonb_set(
      jsonb_set(
        jsonb_set(
          CASE
            WHEN settings ? 'payouts' THEN settings
            ELSE settings || jsonb_build_object('payouts', '{}'::jsonb)
          END,
          '{payouts,new_account_cooling_off_hours}',
          to_jsonb(COALESCE((settings #>> '{payouts,new_account_cooling_off_hours}')::int, 48)),
          true
        ),
        '{payouts,cooling_off_first_account}',
        to_jsonb(COALESCE((settings #>> '{payouts,cooling_off_first_account}')::boolean, false)),
        true
      ),
      '{payouts,cooling_off_admin_added}',
      to_jsonb(COALESCE((settings #>> '{payouts,cooling_off_admin_added}')::boolean, true)),
      true
    ),
    updated_at = NOW()
WHERE is_active = true
  AND NOT COALESCE(settings #> '{payouts}' ? 'new_account_cooling_off_hours', false);
