-- Migration 747: Backfill terminal profile from providers.yoco_machine, then drop the vendor-specific columns.
--
-- Mapping:
--   yoco_machine = 'yes'   → ownership_status = has_terminal,  terminal_provider = 'yoco'
--   yoco_machine = 'no'    → ownership_status = no_terminal
--   yoco_machine = 'other' → ownership_status = has_terminal,  terminal_provider = 'other',
--                            terminal_provider_other = yoco_machine_other
--
-- IMPORTANT: The providers_active view depends on yoco_machine.
-- We drop the view, drop the columns, then rebuild providers_active from
-- information_schema.columns — which immediately reflects the updated schema.
-- This avoids any regex-parsing of pg_get_viewdef output entirely.

-- ── Step 1: Backfill ─────────────────────────────────────────────────────────

INSERT INTO public.provider_payment_terminal_profile (
  tenant_id,
  provider_id,
  has_payment_terminal,
  terminal_ownership_status,
  terminal_provider,
  terminal_provider_other,
  source,
  captured_at,
  updated_at
)
SELECT
  p.tenant_id,
  p.id AS provider_id,
  CASE p.yoco_machine
    WHEN 'yes'   THEN true
    WHEN 'other' THEN true
    WHEN 'no'    THEN false
    ELSE NULL
  END AS has_payment_terminal,
  CASE p.yoco_machine
    WHEN 'yes'   THEN 'has_terminal'::terminal_ownership_status
    WHEN 'no'    THEN 'no_terminal'::terminal_ownership_status
    WHEN 'other' THEN 'has_terminal'::terminal_ownership_status
    ELSE NULL
  END AS terminal_ownership_status,
  CASE p.yoco_machine
    WHEN 'yes'   THEN 'yoco'
    WHEN 'other' THEN 'other'
    ELSE NULL
  END AS terminal_provider,
  CASE WHEN p.yoco_machine = 'other' THEN p.yoco_machine_other ELSE NULL END AS terminal_provider_other,
  'onboarding'::terminal_profile_source AS source,
  COALESCE(p.created_at, now()) AS captured_at,
  now() AS updated_at
FROM public.providers p
WHERE p.yoco_machine IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.provider_payment_terminal_profile x WHERE x.provider_id = p.id
  );

-- ── Step 2: Drop dependent view, drop columns, rebuild view ──────────────────
--
-- Strategy: Drop providers_active (the only known dependent view) with CASCADE,
-- drop the two yoco_machine columns, then rebuild providers_active from
-- information_schema.columns. The information_schema immediately reflects
-- the dropped columns, so no filtering is required.
-- The original view aliased total_paid_out → total_earnings; that is preserved.
-- security_invoker = true (from migration 546) is re-applied.

DO $$
DECLARE
  col_list TEXT;
BEGIN
  -- Drop the dependent view (CASCADE removes any transitive dependents)
  DROP VIEW IF EXISTS public.providers_active CASCADE;

  -- Drop the deprecated vendor-specific columns
  ALTER TABLE public.providers DROP COLUMN IF EXISTS yoco_machine;
  ALTER TABLE public.providers DROP COLUMN IF EXISTS yoco_machine_other;

  -- Build the SELECT column list from the now-updated providers schema.
  -- information_schema.columns no longer includes the dropped columns.
  -- Preserve the original alias: total_paid_out AS total_earnings.
  SELECT string_agg(
    CASE
      WHEN column_name = 'total_paid_out' THEN 'total_paid_out AS total_earnings'
      ELSE column_name
    END,
    ', '
    ORDER BY ordinal_position
  )
  INTO col_list
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'providers';

  IF col_list IS NULL THEN
    RAISE EXCEPTION 'No columns found for providers table — aborting view rebuild';
  END IF;

  -- Recreate the view
  EXECUTE format(
    'CREATE VIEW public.providers_active AS SELECT %s FROM public.providers WHERE deleted_at IS NULL',
    col_list
  );

  -- Re-apply security_invoker (set in migration 546)
  EXECUTE 'ALTER VIEW public.providers_active SET (security_invoker = true)';
END $$;
