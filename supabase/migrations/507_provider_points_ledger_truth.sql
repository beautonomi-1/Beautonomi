-- ============================================================================
-- Migration 507: Provider points = SUM(provider_point_transactions)
-- ============================================================================
-- §Release-audit 2026-04
--
-- Background:
--   `provider_points.total_points` was being computed by
--   `calculate_provider_points(p)` as a stats-based formula
--      bookings * 10 + reviews * 5 + rating bonus + earnings/100
--   while `award_provider_points()` ALSO inserted ledger rows into
--   `provider_point_transactions` AND then OVERWROTE `total_points` with
--   the formula above. This had three bugs:
--
--   1. **Bonuses lost.** Star bonuses (4★/5★) were appended into the
--      transactions ledger by the application service, but the formula
--      didn't include them — so the displayed total disagreed with the
--      transaction history.
--   2. **Explore-post drift.** `award_provider_points_for_explore_post`
--      INCREMENTED `total_points` directly, but any subsequent
--      `award_provider_points()` (e.g. completing the next booking) reset
--      `total_points` back to the formula and silently dropped the
--      explore-post bump.
--   3. **No single source of truth.** Future rewards (referrals, payouts,
--      etc.) had to remember to either be modeled as stats (impossible
--      for one-off bonuses) or to be re-implemented inside the formula.
--
-- Fix: make `calculate_provider_points()` the sum of the ledger. The
-- ledger already records everything via `provider_point_transactions`, and
-- `award_provider_points()` always inserts a row before recomputing
-- totals, so this becomes idempotent and additive.
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_provider_points(p_provider_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(points), 0)::INTEGER
  FROM provider_point_transactions
  WHERE provider_id = p_provider_id;
$$;

COMMENT ON FUNCTION calculate_provider_points IS
  '§Release-audit 2026-04: total points = sum of provider_point_transactions ledger. '
  'Single source of truth — keeps star bonuses, explore-post bonuses, and any future '
  'one-off rewards from being silently dropped by stats-based recalculation.';

-- Backfill: recompute all providers so existing UI matches the new
-- definition. This relies on `award_provider_points` having inserted
-- transactions for completed bookings/reviews historically; if a
-- provider has bookings with no ledger rows, an admin can run the
-- backfill route at /api/admin/gamification/backfill/...
DO $$
DECLARE
  r RECORD;
  v_pts INTEGER;
BEGIN
  FOR r IN SELECT provider_id FROM provider_points LOOP
    v_pts := calculate_provider_points(r.provider_id);
    UPDATE provider_points
       SET total_points = v_pts,
           lifetime_points = GREATEST(lifetime_points, v_pts),
           last_calculated_at = NOW()
     WHERE provider_id = r.provider_id;
  END LOOP;
END $$;
