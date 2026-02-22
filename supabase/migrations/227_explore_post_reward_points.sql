-- ============================================================================
-- Migration 227: Award provider points for posting to Explore after a booking
-- ============================================================================
-- When a provider publishes an Explore post and has at least one completed
-- booking in the last 7 days, award reward points (once per post).
-- ============================================================================

-- Points awarded per eligible post (15 points).
-- Eligible = provider has completed at least one booking in the last 7 days.
-- We use source = 'explore_post_after_booking' and source_id = post id.

-- Function: award points when provider posts to Explore after a recent booking.
-- Call from API after creating a published explore post.
-- SECURITY DEFINER so it can insert into provider_point_transactions and update provider_points.
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
  v_points INTEGER := 15;
  v_has_recent_booking BOOLEAN;
  v_already_awarded BOOLEAN;
BEGIN
  -- Already awarded for this post?
  SELECT EXISTS (
    SELECT 1 FROM provider_point_transactions
    WHERE provider_id = p_provider_id
      AND source = 'explore_post_after_booking'
      AND source_id = p_post_id
  ) INTO v_already_awarded;
  IF v_already_awarded THEN
    RETURN 0;
  END IF;

  -- Provider has at least one completed booking in the last 7 days?
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

  -- Insert transaction
  INSERT INTO provider_point_transactions (provider_id, points, source, source_id, description)
  VALUES (
    p_provider_id,
    v_points,
    'explore_post_after_booking',
    p_post_id,
    'Reward points for posting to Explore after a booking'
  );

  -- Add points to provider_points (do not recalculate from stats)
  INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
  VALUES (p_provider_id, v_points, v_points, NOW())
  ON CONFLICT (provider_id)
  DO UPDATE SET
    total_points = provider_points.total_points + v_points,
    lifetime_points = provider_points.lifetime_points + v_points,
    last_calculated_at = NOW();

  -- Re-check badges (may have levelled up)
  PERFORM check_provider_badges(p_provider_id);

  RETURN v_points;
END;
$$;

COMMENT ON FUNCTION award_provider_points_for_explore_post(UUID, UUID) IS
  'Awards 15 points to the provider when they post to Explore and have a completed booking in the last 7 days. Idempotent per post. Call from API after creating an explore post.';
