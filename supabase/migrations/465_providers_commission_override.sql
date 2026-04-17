-- Per-provider platform commission override (percentage 0–100), set via admin API.
-- When non-null, runtime payment/ledger code uses this instead of platform_settings.payouts.platform_commission_percentage.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'providers' AND column_name = 'commission_override'
  ) THEN
    ALTER TABLE public.providers
      ADD COLUMN commission_override NUMERIC(5, 2)
        CHECK (commission_override IS NULL OR (commission_override >= 0 AND commission_override <= 100));
    COMMENT ON COLUMN public.providers.commission_override IS
      'Optional platform commission % for this provider; overrides tenant platform_settings when set';
  END IF;
END $$;
