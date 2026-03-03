-- 286_badge_subscription_featured_and_teasers.sql
-- 1) Use get_provider_subscription_status / badge free_subscription in tier and feature access
-- 2) Set providers.is_featured from badge benefits when recalculating badges
-- Requires: 188_create_provider_gamification (get_provider_subscription_status), 207 (get_provider_subscription_tier, provider_has_feature_access)

-- Extend get_provider_subscription_tier to consider badge free_subscription
CREATE OR REPLACE FUNCTION get_provider_subscription_tier(provider_id_param UUID)
RETURNS TABLE (
  plan_id UUID,
  plan_name TEXT,
  is_free BOOLEAN,
  features JSONB,
  max_bookings_per_month INTEGER,
  max_staff_members INTEGER,
  max_locations INTEGER
) AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- 1) Active paid subscription
  RETURN QUERY
  SELECT 
    sp.id,
    sp.name,
    COALESCE(sp.is_free, false),
    COALESCE(sp.features, '[]'::jsonb),
    sp.max_bookings_per_month,
    sp.max_staff_members,
    sp.max_locations
  FROM provider_subscriptions ps
  JOIN subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.provider_id = provider_id_param
  AND ps.status = 'active'
  AND (ps.expires_at IS NULL OR ps.expires_at > NOW())
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2) No paid subscription: check badge free_subscription (get_provider_subscription_status)
  v_status := get_provider_subscription_status(provider_id_param);
  IF v_status = 'active' THEN
    -- Badge grants active (free) tier: return free plan if it exists
    RETURN QUERY
    SELECT 
      sp.id,
      sp.name,
      COALESCE(sp.is_free, true),
      COALESCE(sp.features, '[]'::jsonb),
      sp.max_bookings_per_month,
      sp.max_staff_members,
      sp.max_locations
    FROM subscription_plans sp
    WHERE sp.is_free = true
    AND sp.is_active = true
    ORDER BY sp.display_order
    LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
    -- No free plan in DB: return synthetic tier so feature checks pass
    RETURN QUERY SELECT
      NULL::UUID,
      'Badge benefit'::TEXT,
      true,
      '{"booking_online": true, "reviews_ratings": true, "basic_analytics": true}'::jsonb,
      NULL::INTEGER,
      NULL::INTEGER,
      NULL::INTEGER;
    RETURN;
  END IF;

  -- 3) No badge active: return free tier from subscription_plans (existing behavior)
  RETURN QUERY
  SELECT 
    sp.id,
    sp.name,
    COALESCE(sp.is_free, false),
    COALESCE(sp.features, '[]'::jsonb),
    sp.max_bookings_per_month,
    sp.max_staff_members,
    sp.max_locations
  FROM subscription_plans sp
  WHERE sp.is_free = true
  AND sp.is_active = true
  ORDER BY sp.display_order
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_provider_subscription_tier IS 'Returns the active subscription tier; considers paid subscription, then badge free_subscription, then free plan.';

-- Extend provider_has_feature_access to consider badge free_subscription
CREATE OR REPLACE FUNCTION provider_has_feature_access(
  provider_id_param UUID,
  feature_key_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  plan_features JSONB;
  is_free_plan BOOLEAN;
  v_status TEXT;
BEGIN
  -- Get subscription plan features from paid subscription
  SELECT 
    sp.features,
    COALESCE(sp.is_free, false)
  INTO plan_features, is_free_plan
  FROM provider_subscriptions ps
  JOIN subscription_plans sp ON sp.id = ps.plan_id
  WHERE ps.provider_id = provider_id_param
  AND ps.status = 'active'
  AND (ps.expires_at IS NULL OR ps.expires_at > NOW());

  -- If no active paid subscription, check badge then free tier
  IF plan_features IS NULL THEN
    v_status := get_provider_subscription_status(provider_id_param);
    IF v_status = 'active' THEN
      -- Badge grants free-tier-like access to basic features
      RETURN feature_key_param IN (
        'booking_online',
        'reviews_ratings',
        'basic_analytics'
      );
    END IF;

    SELECT COALESCE(sp.is_free, false)
    INTO is_free_plan
    FROM subscription_plans sp
    WHERE sp.is_free = true
    AND sp.is_active = true
    ORDER BY sp.display_order
    LIMIT 1;

    IF is_free_plan THEN
      RETURN feature_key_param IN (
        'booking_online',
        'reviews_ratings',
        'basic_analytics'
      );
    END IF;

    RETURN false;
  END IF;

  RETURN plan_features ? feature_key_param 
    OR (plan_features::text LIKE '%' || feature_key_param || '%');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update check_provider_badges to set providers.is_featured from badge benefits
CREATE OR REPLACE FUNCTION check_provider_badges(p_provider_id UUID)
RETURNS UUID AS $$
DECLARE
  v_current_badge_id UUID;
  v_points INTEGER;
  v_rating NUMERIC;
  v_reviews INTEGER;
  v_bookings INTEGER;
  v_eligible_badge_id UUID;
  v_badge_benefits JSONB;
  v_is_featured BOOLEAN;
BEGIN
  SELECT 
    COALESCE(pp.current_badge_id, NULL),
    COALESCE(pp.total_points, 0),
    COALESCE(p.rating_average, 0),
    COALESCE(p.review_count, 0),
    COALESCE(p.total_bookings, 0)
  INTO v_current_badge_id, v_points, v_rating, v_reviews, v_bookings
  FROM providers p
  LEFT JOIN provider_points pp ON pp.provider_id = p.id
  WHERE p.id = p_provider_id;
  
  IF NOT EXISTS (SELECT 1 FROM provider_points WHERE provider_id = p_provider_id) THEN
    v_points := calculate_provider_points(p_provider_id);
    INSERT INTO provider_points (provider_id, total_points, lifetime_points, last_calculated_at)
    VALUES (p_provider_id, v_points, v_points, NOW())
    ON CONFLICT (provider_id) DO NOTHING;
  END IF;

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
      current_badge_id = v_eligible_badge_id,
      badge_earned_at = CASE WHEN v_eligible_badge_id IS NOT NULL THEN NOW() ELSE NULL END,
      badge_expires_at = CASE 
        WHEN v_eligible_badge_id IS NOT NULL 
        THEN NOW() + INTERVAL '30 days'
        ELSE NULL 
      END;

    UPDATE providers
    SET current_badge_id = v_eligible_badge_id
    WHERE id = p_provider_id;
  END IF;

  -- Always sync is_featured from current eligible badge (recalc or badge change)
  IF v_eligible_badge_id IS NOT NULL THEN
    SELECT COALESCE((benefits->>'featured')::BOOLEAN, false) INTO v_is_featured
    FROM provider_badges WHERE id = v_eligible_badge_id;
  ELSE
    v_is_featured := false;
  END IF;
  UPDATE providers SET is_featured = v_is_featured WHERE id = p_provider_id;

  RETURN v_eligible_badge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- One-off: sync is_featured from current badge for all providers
UPDATE providers p
SET is_featured = COALESCE((pb.benefits->>'featured')::BOOLEAN, false)
FROM provider_badges pb
WHERE p.current_badge_id = pb.id;

UPDATE providers
SET is_featured = false
WHERE current_badge_id IS NULL;
