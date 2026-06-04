-- ============================================================================
-- Migration 657: Provider gamification prod heal (ledger truth, badges, awards)
-- ============================================================================
-- 1. Award booking points from DB when status -> completed (API path backup)
-- 2. Explore-post awards use ledger sum (migration 507 parity)
-- 3. Badge expiry maintenance + re-eligibility in check_provider_badges
-- 4. One-off backfill for providers with history but empty point ledger
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Explore post: insert ledger row then recompute totals via award_provider_points
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION award_provider_points_for_explore_post(
  p_provider_id UUID,
  p_post_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
  v_has_recent_booking BOOLEAN;
  v_already_awarded BOOLEAN;
BEGIN
  v_points := get_provider_point_rule_points('explore_post_after_booking');
  IF v_points <= 0 THEN
    v_points := 15;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM provider_point_transactions
    WHERE provider_id = p_provider_id
      AND source = 'explore_post_after_booking'
      AND source_id = p_post_id
  ) INTO v_already_awarded;
  IF v_already_awarded THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE provider_id = p_provider_id
      AND status = 'completed'
      AND completed_at IS NOT NULL
      AND completed_at >= (NOW() - INTERVAL '7 days')
    LIMIT 1
  ) INTO v_has_recent_booking;

  IF NOT v_has_recent_booking THEN
    RETURN 0;
  END IF;

  RETURN award_provider_points(
    p_provider_id,
    v_points,
    'explore_post_after_booking',
    p_post_id,
    'Reward points for posting to Explore after a booking'
  );
END;
$$;

COMMENT ON FUNCTION award_provider_points_for_explore_post(UUID, UUID) IS
  'Explore reward: ledger row + award_provider_points (507 ledger truth).';

-- ---------------------------------------------------------------------------
-- Booking completion trigger (idempotent with app awardProviderPoints)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_award_provider_points_on_booking_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
  v_should_award BOOLEAN := false;
BEGIN
  IF NEW.provider_id IS NULL OR NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    v_should_award := true;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_should_award := true;
  END IF;

  IF v_should_award THEN
    IF NOT EXISTS (
      SELECT 1 FROM provider_point_transactions
      WHERE provider_id = NEW.provider_id
        AND source = 'booking_completed'
        AND source_id = NEW.id
    ) THEN
      v_points := get_provider_point_rule_points('booking_completed');
      IF v_points <= 0 THEN
        v_points := 10;
      END IF;
      PERFORM award_provider_points(
        NEW.provider_id,
        v_points,
        'booking_completed',
        NEW.id,
        'Points awarded for completed booking'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_award_provider_points_on_completed ON bookings;
CREATE TRIGGER bookings_award_provider_points_on_completed
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_award_provider_points_on_booking_completed();

-- ---------------------------------------------------------------------------
-- check_provider_badges: expire maintenance badges, then evaluate eligibility
-- ---------------------------------------------------------------------------
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
    SET
      current_badge_id = NULL,
      badge_earned_at = NULL,
      badge_expires_at = NULL,
      last_calculated_at = NOW()
    WHERE provider_id = p_provider_id;

    UPDATE providers
    SET current_badge_id = NULL, is_featured = false
    WHERE id = p_provider_id;

    v_current_badge_id := NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM provider_points WHERE provider_id = p_provider_id) THEN
    v_points := calculate_provider_points(p_provider_id);
    INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
    VALUES (p_provider_id, v_points, v_points, NOW())
    ON CONFLICT (provider_id) DO NOTHING;
  END IF;

  SELECT COALESCE(pp.total_points, 0)
  INTO v_points
  FROM provider_points pp
  WHERE pp.provider_id = p_provider_id;

  SELECT id INTO v_eligible_badge_id
  FROM provider_badges
  WHERE is_active = true
    AND (requirements->>'points')::INTEGER <= v_points
    AND (requirements->>'min_rating')::NUMERIC <= COALESCE(v_rating, 0)
    AND (requirements->>'min_reviews')::INTEGER <= COALESCE(v_reviews, 0)
    AND (requirements->>'min_bookings')::INTEGER <= COALESCE(v_bookings, 0)
  ORDER BY tier DESC, (requirements->>'points')::INTEGER DESC
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

    UPDATE providers
    SET current_badge_id = v_eligible_badge_id
    WHERE id = p_provider_id;
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

-- ---------------------------------------------------------------------------
-- Prod one-off: backfill empty ledgers for providers with booking/review history
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS provider_id
    FROM providers p
    WHERE (
      EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.provider_id = p.id AND b.status = 'completed'
      )
      OR COALESCE(p.review_count, 0) > 0
    )
    AND NOT EXISTS (
      SELECT 1 FROM provider_point_transactions t
      WHERE t.provider_id = p.id
    )
  LOOP
    BEGIN
      PERFORM backfill_provider_point_transactions(r.provider_id);
      PERFORM recalculate_provider_gamification(r.provider_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '657 gamification heal failed for provider %: %', r.provider_id, SQLERRM;
    END;
  END LOOP;
END $$;
