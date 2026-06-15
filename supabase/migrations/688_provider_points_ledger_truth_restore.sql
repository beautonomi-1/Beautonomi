-- ============================================================================
-- Migration 688: Restore ledger-truth provider points (fix 672 regression)
-- ============================================================================
-- Migration 507 made total_points = SUM(provider_point_transactions).
-- Migration 663 built award/clawback on that contract.
-- Migration 672 accidentally replaced calculate_provider_points() with a
-- stats formula (bookings×rule + reviews×rule + rating bonus + earnings/100),
-- which:
--   • inflated totals with hidden earnings/rating bonuses not in Point rules
--   • disagreed with "Recent points" (ledger rows only)
--   • dropped explore-post and star-review bonuses from totals on recalc
--
-- Fix: restore SUM(ledger). Recompute all provider balances and badges.
-- get_provider_recognized_earnings() is retained for reporting; it no longer
-- feeds gamification totals.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_provider_points(p_provider_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(points), 0)::INTEGER
  FROM public.provider_point_transactions
  WHERE provider_id = p_provider_id;
$$;

COMMENT ON FUNCTION public.calculate_provider_points(UUID) IS
  '688: total points = SUM(provider_point_transactions). Single source of truth '
  'aligned with admin Point rules and Recent points UI (507/663 contract).';

-- Recompute totals + badge eligibility for every provider with ledger or points row.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT provider_id
    FROM (
      SELECT provider_id FROM public.provider_points
      UNION
      SELECT DISTINCT provider_id FROM public.provider_point_transactions
    ) u
  ) LOOP
    PERFORM public.recalculate_provider_gamification(r.provider_id);
  END LOOP;
END $$;
