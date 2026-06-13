-- Treat missing badge requirement keys as 0 (no constraint) instead of NULL (never matches).
-- Fixes admin-created badges with partial/empty requirements JSON being silently unearnable.

CREATE OR REPLACE FUNCTION check_provider_badges(p_provider_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_badge_id UUID;
  v_points INTEGER;
  v_rating NUMERIC;
  v_reviews INTEGER;
  v_bookings INTEGER;
  v_eligible_badge_id UUID;
  v_badge_expires_at TIMESTAMPTZ;
  v_is_featured BOOLEAN;
BEGIN
  SELECT
    COALESCE(pp.current_badge_id, NULL),
    COALESCE(pp.total_points, 0),
    COALESCE(p.rating_average, 0),
    COALESCE(p.review_count, 0),
    COALESCE(p.total_bookings, 0),
    pp.badge_expires_at
  INTO v_current_badge_id, v_points, v_rating, v_reviews, v_bookings, v_badge_expires_at
  FROM providers p
  LEFT JOIN provider_points pp ON pp.provider_id = p.id
  WHERE p.id = p_provider_id;

  IF v_current_badge_id IS NOT NULL
    AND v_badge_expires_at IS NOT NULL
    AND v_badge_expires_at <= NOW()
  THEN
    UPDATE provider_points
    SET current_badge_id = NULL, badge_earned_at = NULL, badge_expires_at = NULL, last_calculated_at = NOW()
    WHERE provider_id = p_provider_id;

    UPDATE providers SET current_badge_id = NULL, is_featured = false WHERE id = p_provider_id;

    v_current_badge_id := NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM provider_points WHERE provider_id = p_provider_id) THEN
    v_points := GREATEST(0, calculate_provider_points(p_provider_id));
    INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
    VALUES (p_provider_id, v_points, v_points, NOW())
    ON CONFLICT (provider_id) DO NOTHING;
  END IF;

  SELECT COALESCE(pp.total_points, 0) INTO v_points
  FROM provider_points pp WHERE pp.provider_id = p_provider_id;

  SELECT id INTO v_eligible_badge_id
  FROM provider_badges
  WHERE is_active = true
    AND COALESCE((requirements->>'points')::INTEGER, 0) <= v_points
    AND COALESCE((requirements->>'min_rating')::NUMERIC, 0) <= COALESCE(v_rating, 0)
    AND COALESCE((requirements->>'min_reviews')::INTEGER, 0) <= COALESCE(v_reviews, 0)
    AND COALESCE((requirements->>'min_bookings')::INTEGER, 0) <= COALESCE(v_bookings, 0)
  ORDER BY tier DESC, COALESCE((requirements->>'points')::INTEGER, 0) DESC
  LIMIT 1;

  IF v_eligible_badge_id IS DISTINCT FROM v_current_badge_id THEN
    INSERT INTO provider_points (provider_id, total_points, lifetime_points, current_badge_id, badge_earned_at, badge_expires_at)
    VALUES (
      p_provider_id,
      v_points,
      v_points,
      v_eligible_badge_id,
      CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() ELSE NULL END,
      CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() + INTERVAL '30 days' ELSE NULL END
    )
    ON CONFLICT (provider_id)
    DO UPDATE SET
      total_points = EXCLUDED.total_points,
      current_badge_id = v_eligible_badge_id,
      badge_earned_at = CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() ELSE NULL END,
      badge_expires_at = CASE
        WHEN v_eligible_badge_id IS NOT NULL THEN NOW() + INTERVAL '30 days'
        ELSE NULL
      END,
      last_calculated_at = NOW();

    UPDATE providers SET current_badge_id = v_eligible_badge_id WHERE id = p_provider_id;
  ELSIF v_eligible_badge_id IS NOT NULL THEN
    UPDATE provider_points
    SET badge_expires_at = NOW() + INTERVAL '30 days', last_calculated_at = NOW()
    WHERE provider_id = p_provider_id;
  END IF;

  IF v_eligible_badge_id IS NOT NULL THEN
    SELECT COALESCE((benefits->>'featured')::BOOLEAN, false) INTO v_is_featured
    FROM provider_badges WHERE id = v_eligible_badge_id;
  ELSE
    v_is_featured := false;
  END IF;
  UPDATE providers SET is_featured = v_is_featured WHERE id = p_provider_id;

  RETURN v_eligible_badge_id;
END;
$$;
