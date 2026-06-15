-- ============================================================================
-- Migration 689: Fix lifetime points + align lifetime with ledger awards
-- ============================================================================
-- After migration 672/688 corrections, lifetime_points could stay inflated
-- (GREATEST(lifetime, total) copied phantom stats totals into lifetime).
--
-- Lifetime semantics:
--   • Increment only when a new positive ledger row is inserted (never on recalc).
--   • Clawbacks reduce total_points but leave lifetime_points unchanged (663).
--   • One-time backfill: lifetime = GREATEST(total, sum of positive ledger rows).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_provider_lifetime_points(p_provider_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0)::INTEGER
  FROM public.provider_point_transactions
  WHERE provider_id = p_provider_id;
$$;

COMMENT ON FUNCTION public.calculate_provider_lifetime_points(UUID) IS
  '689: sum of positive provider_point_transactions (minimum displayable lifetime).';

CREATE OR REPLACE FUNCTION public.award_provider_points(
  p_provider_id UUID,
  p_points INTEGER,
  p_source TEXT,
  p_source_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total INTEGER;
  v_inserted INTEGER;
BEGIN
  INSERT INTO public.provider_point_transactions (provider_id, points, source, source_id, description)
  VALUES (p_provider_id, p_points, p_source, p_source_id, p_description)
  ON CONFLICT (provider_id, source, source_id) WHERE source_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  v_new_total := GREATEST(0, public.calculate_provider_points(p_provider_id));

  INSERT INTO public.provider_points (provider_id, total_points, lifetime_points)
  VALUES (
    p_provider_id,
    v_new_total,
    CASE
      WHEN v_inserted > 0 AND p_points > 0 THEN p_points
      ELSE v_new_total
    END
  )
  ON CONFLICT (provider_id)
  DO UPDATE SET
    total_points = v_new_total,
    lifetime_points = CASE
      WHEN v_inserted > 0 AND p_points > 0 THEN provider_points.lifetime_points + p_points
      ELSE provider_points.lifetime_points
    END,
    last_calculated_at = NOW();

  PERFORM public.check_provider_badges(p_provider_id);

  RETURN v_new_total;
END;
$$;

COMMENT ON FUNCTION public.award_provider_points(UUID, INTEGER, TEXT, UUID, TEXT) IS
  '689: idempotent ledger insert; total = SUM(ledger); lifetime += p_points on new positive award only.';

CREATE OR REPLACE FUNCTION public.recalculate_provider_gamification(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_points INTEGER;
  v_badge_id UUID;
  v_lifetime INTEGER;
BEGIN
  v_new_points := GREATEST(0, public.calculate_provider_points(p_provider_id));
  v_lifetime := GREATEST(v_new_points, public.calculate_provider_lifetime_points(p_provider_id));

  INSERT INTO public.provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
  VALUES (p_provider_id, v_new_points, v_lifetime, NOW())
  ON CONFLICT (provider_id)
  DO UPDATE SET
    total_points = v_new_points,
    lifetime_points = v_lifetime,
    last_calculated_at = NOW();

  v_badge_id := public.check_provider_badges(p_provider_id);

  RETURN jsonb_build_object('points', v_new_points, 'badge_id', v_badge_id);
END;
$$;

-- Correct inflated lifetime values from the 672 stats-formula era.
UPDATE public.provider_points pp
SET lifetime_points = corrected.lifetime,
    last_calculated_at = NOW()
FROM (
  SELECT
    p.provider_id,
    GREATEST(
      GREATEST(0, public.calculate_provider_points(p.provider_id)),
      public.calculate_provider_lifetime_points(p.provider_id)
    ) AS lifetime
  FROM public.provider_points p
) corrected
WHERE pp.provider_id = corrected.provider_id
  AND pp.lifetime_points IS DISTINCT FROM corrected.lifetime;
