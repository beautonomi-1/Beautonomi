-- ============================================================================
-- Migration 663: Provider points integrity
-- ============================================================================
-- Hardens the provider gamification points ledger:
--  1. Idempotent awards: dedupe + partial unique index on
--     (provider_id, source, source_id); award_provider_points becomes
--     ON CONFLICT DO NOTHING so concurrent trigger+API / retries / double-clicks
--     can never double-award. total_points is floored at 0 so an admin penalty
--     larger than the balance no longer violates the CHECK (>= 0) constraint.
--  2. Full clawback: completed bookings that are un-completed or fully refunded,
--     and reviews that are deleted or have their rating edited, reverse/re-grade
--     their points (DB triggers so this holds for every code path).
--  3. Badge maintenance: a badge auto-renews while the provider still meets the
--     requirements (no more losing perks while qualifying); an expiry sweep clears
--     badges that are no longer maintained.
--
-- Single source of truth remains migration 507: total_points = SUM(ledger).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1a: dedupe historical duplicates, then enforce idempotency at the DB
-- ---------------------------------------------------------------------------
-- Keep one row per (provider_id, source, source_id); drop later duplicates.
DELETE FROM provider_point_transactions a
USING provider_point_transactions b
WHERE a.ctid > b.ctid
  AND a.provider_id = b.provider_id
  AND a.source = b.source
  AND a.source_id = b.source_id
  AND a.source_id IS NOT NULL;

-- Partial unique index: admin_penalty / manual rows (source_id NULL) are exempt
-- so multiple penalties can coexist; all event-sourced rows are deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_point_tx_idem
  ON provider_point_transactions (provider_id, source, source_id)
  WHERE source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Part 1b: award_provider_points — idempotent insert + floored, ledger-truth total
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION award_provider_points(
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
  v_current_lifetime INTEGER;
BEGIN
  -- Idempotent for event-sourced rows; rows with NULL source_id (admin_penalty,
  -- manual adjustments) are not covered by the partial index and always insert.
  INSERT INTO provider_point_transactions (provider_id, points, source, source_id, description)
  VALUES (p_provider_id, p_points, p_source, p_source_id, p_description)
  ON CONFLICT (provider_id, source, source_id) WHERE source_id IS NOT NULL
  DO NOTHING;

  -- total = SUM(ledger) (507), floored at 0 so net-negative ledgers (penalties
  -- exceeding the balance) don't violate provider_points.total_points CHECK (>= 0).
  v_new_total := GREATEST(0, calculate_provider_points(p_provider_id));

  SELECT COALESCE(lifetime_points, 0) INTO v_current_lifetime
  FROM provider_points
  WHERE provider_id = p_provider_id;

  INSERT INTO provider_points (provider_id, total_points, lifetime_points)
  VALUES (p_provider_id, v_new_total, GREATEST(v_new_total, COALESCE(v_current_lifetime, 0)))
  ON CONFLICT (provider_id)
  DO UPDATE SET
    total_points = v_new_total,
    lifetime_points = GREATEST(provider_points.lifetime_points, v_new_total),
    last_calculated_at = NOW();

  PERFORM check_provider_badges(p_provider_id);

  RETURN v_new_total;
END;
$$;

COMMENT ON FUNCTION award_provider_points(UUID, INTEGER, TEXT, UUID, TEXT) IS
  '663: idempotent (ON CONFLICT DO NOTHING via ux_provider_point_tx_idem) ledger insert; '
  'total_points = GREATEST(0, SUM(ledger)) (507 ledger truth, floored for admin penalties).';

-- ---------------------------------------------------------------------------
-- Part 1c: recalculate_provider_gamification — floor total at 0 as well
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_provider_gamification(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_points INTEGER;
  v_badge_id UUID;
BEGIN
  v_new_points := GREATEST(0, calculate_provider_points(p_provider_id));

  INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
  VALUES (p_provider_id, v_new_points, v_new_points, NOW())
  ON CONFLICT (provider_id)
  DO UPDATE SET
    total_points = v_new_points,
    lifetime_points = GREATEST(provider_points.lifetime_points, v_new_points),
    last_calculated_at = NOW();

  v_badge_id := check_provider_badges(p_provider_id);

  RETURN jsonb_build_object('points', v_new_points, 'badge_id', v_badge_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Part 2a: reverse points for a given (source, source_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_provider_points_for_source(
  p_provider_id UUID,
  p_source TEXT,
  p_source_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total INTEGER;
BEGIN
  IF p_source_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM provider_point_transactions
  WHERE provider_id = p_provider_id
    AND source = p_source
    AND source_id = p_source_id;

  v_new_total := GREATEST(0, calculate_provider_points(p_provider_id));

  -- lifetime_points intentionally never decreases.
  UPDATE provider_points
  SET total_points = v_new_total,
      last_calculated_at = NOW()
  WHERE provider_id = p_provider_id;

  PERFORM check_provider_badges(p_provider_id);
END;
$$;

COMMENT ON FUNCTION remove_provider_points_for_source(UUID, TEXT, UUID) IS
  '663: clawback — delete ledger rows for (source, source_id), refloor total, re-evaluate badge.';

-- ---------------------------------------------------------------------------
-- Part 2b: graded review points (base + 4star/5star bonus from rules)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION provider_review_points(p_rating NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
BEGIN
  v_points := get_provider_point_rule_points('review_received');
  IF v_points <= 0 THEN
    v_points := 5;
  END IF;

  IF p_rating >= 5 THEN
    v_points := v_points + COALESCE(NULLIF(get_provider_point_rule_points('review_received_5star_bonus'), 0), 10);
  ELSIF p_rating >= 4 THEN
    v_points := v_points + COALESCE(NULLIF(get_provider_point_rule_points('review_received_4star_bonus'), 0), 5);
  END IF;

  RETURN v_points;
END;
$$;

-- ---------------------------------------------------------------------------
-- Part 2c: booking trigger — award on completion, reverse on un-complete/refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_award_provider_points_on_booking_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
BEGIN
  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Award when the booking enters 'completed'. Refunded completions never earn
  -- points; if an already-completed booking later becomes refunded, the clawback
  -- branch below removes the earlier award.
  IF NEW.payment_status IS DISTINCT FROM 'refunded'
     AND (
       (TG_OP = 'INSERT' AND NEW.status = 'completed')
       OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
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

  -- Clawback: booking leaves 'completed', or it gets fully refunded (the refund
  -- path keeps status='completed' and only flips payment_status to 'refunded').
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
       OR (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded') THEN
      PERFORM remove_provider_points_for_source(NEW.provider_id, 'booking_completed', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_award_provider_points_on_completed ON bookings;
CREATE TRIGGER bookings_award_provider_points_on_completed
  AFTER INSERT OR UPDATE OF status, payment_status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_award_provider_points_on_booking_completed();

-- ---------------------------------------------------------------------------
-- Part 2d: reviews trigger — award / re-grade / clawback
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_provider_points_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.provider_id IS NOT NULL THEN
      PERFORM remove_provider_points_for_source(OLD.provider_id, 'review_received', OLD.id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.provider_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Re-grade: drop the prior award for this review, then re-award at the new rating.
    DELETE FROM provider_point_transactions
    WHERE provider_id = NEW.provider_id
      AND source = 'review_received'
      AND source_id = NEW.id;
  END IF;

  PERFORM award_provider_points(
    NEW.provider_id,
    provider_review_points(NEW.rating),
    'review_received',
    NEW.id,
    'Points awarded for ' || NEW.rating || '-star review'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_provider_points ON reviews;
CREATE TRIGGER reviews_provider_points
  AFTER INSERT OR UPDATE OF rating OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION trigger_provider_points_on_review();

-- ---------------------------------------------------------------------------
-- Part 3a: check_provider_badges — renew expiry while still eligible
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

  -- Expire a maintenance badge whose window has elapsed; it may be re-assigned
  -- below if the provider is still eligible (handled by the DISTINCT branch).
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

    UPDATE providers SET current_badge_id = v_eligible_badge_id WHERE id = p_provider_id;
  ELSIF v_eligible_badge_id IS NOT NULL THEN
    -- Still eligible for the same badge: renew the maintenance window so an active,
    -- qualifying provider never loses the badge (and its perks) on the 30-day clock.
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

-- ---------------------------------------------------------------------------
-- Part 3b: scheduled sweep — clear/renew badges past their maintenance window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_provider_badges()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT provider_id
    FROM provider_points
    WHERE current_badge_id IS NOT NULL
      AND badge_expires_at IS NOT NULL
      AND badge_expires_at <= NOW()
  LOOP
    BEGIN
      -- Renews if still eligible, otherwise clears the badge + is_featured.
      PERFORM check_provider_badges(r.provider_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '663 expire_provider_badges failed for provider %: %', r.provider_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION expire_provider_badges() IS
  '663: daily sweep — re-evaluate every provider whose badge_expires_at has passed.';
