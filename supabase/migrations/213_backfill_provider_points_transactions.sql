-- Beautonomi Database Migration
-- 189_backfill_provider_points_transactions.sql
-- Backfills point transactions for historical bookings and reviews

-- Function to backfill point transactions for a provider based on historical data
CREATE OR REPLACE FUNCTION backfill_provider_point_transactions(p_provider_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_booking RECORD;
  v_review RECORD;
  v_transaction_count INTEGER := 0;
  v_points INTEGER;
BEGIN
  -- Backfill points for completed bookings
  FOR v_booking IN 
    SELECT id, completed_at, created_at
    FROM bookings
    WHERE provider_id = p_provider_id
      AND status = 'completed'
      AND completed_at IS NOT NULL
    ORDER BY completed_at ASC
  LOOP
    -- Check if transaction already exists
    IF NOT EXISTS (
      SELECT 1 FROM provider_point_transactions
      WHERE provider_id = p_provider_id
        AND source = 'booking_completed'
        AND source_id = v_booking.id
    ) THEN
      -- Award 10 points per completed booking
      INSERT INTO provider_point_transactions (
        provider_id,
        points,
        source,
        source_id,
        description,
        created_at
      ) VALUES (
        p_provider_id,
        10,
        'booking_completed',
        v_booking.id,
        'Points awarded for completed booking (backfilled)',
        COALESCE(v_booking.completed_at, v_booking.created_at)
      );
      v_transaction_count := v_transaction_count + 1;
    END IF;
  END LOOP;

  -- Backfill points for reviews
  FOR v_review IN 
    SELECT r.id, r.rating, r.created_at
    FROM reviews r
    WHERE r.provider_id = p_provider_id
    ORDER BY r.created_at ASC
  LOOP
    -- Check if transaction already exists
    IF NOT EXISTS (
      SELECT 1 FROM provider_point_transactions
      WHERE provider_id = p_provider_id
        AND source = 'review_received'
        AND source_id = v_review.id
    ) THEN
      -- Award points based on rating (same logic as award_provider_points)
      v_points := 5; -- Base points per review
      
      -- Bonus points for high ratings
      IF v_review.rating >= 5 THEN
        v_points := v_points + 10; -- 15 total for 5-star review
      ELSIF v_review.rating >= 4 THEN
        v_points := v_points + 5; -- 10 total for 4-star review
      END IF;

      INSERT INTO provider_point_transactions (
        provider_id,
        points,
        source,
        source_id,
        description,
        created_at
      ) VALUES (
        p_provider_id,
        v_points,
        'review_received',
        v_review.id,
        'Points awarded for ' || v_review.rating || '-star review (backfilled)',
        v_review.created_at
      );
      v_transaction_count := v_transaction_count + 1;
    END IF;
  END LOOP;

  RETURN v_transaction_count;
END;
$$ LANGUAGE plpgsql;

-- Function to backfill all providers
CREATE OR REPLACE FUNCTION backfill_all_provider_point_transactions()
RETURNS TABLE(provider_id UUID, transactions_created INTEGER) AS $$
DECLARE
  v_provider RECORD;
  v_count INTEGER;
BEGIN
  FOR v_provider IN SELECT id FROM providers WHERE status = 'active' LOOP
    BEGIN
      v_count := backfill_provider_point_transactions(v_provider.id);
      
      -- Recalculate points after backfilling transactions
      PERFORM recalculate_provider_gamification(v_provider.id);
      
      RETURN QUERY SELECT v_provider.id, v_count;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      RAISE WARNING 'Error backfilling transactions for provider %: %', v_provider.id, SQLERRM;
      RETURN QUERY SELECT v_provider.id, 0;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Update initialize_provider_points_for_all to also backfill transactions
CREATE OR REPLACE FUNCTION initialize_provider_points_for_all()
RETURNS INTEGER AS $$
DECLARE
  v_provider RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_provider IN SELECT id FROM providers WHERE status = 'active' LOOP
    BEGIN
      -- Initialize points if not exists
      INSERT INTO provider_points (provider_id, total_points, lifetime_points)
      SELECT 
        v_provider.id,
        calculate_provider_points(v_provider.id),
        calculate_provider_points(v_provider.id)
      ON CONFLICT (provider_id) DO NOTHING;
      
      -- Backfill historical transactions
      PERFORM backfill_provider_point_transactions(v_provider.id);
      
      -- Recalculate points based on transactions
      PERFORM recalculate_provider_gamification(v_provider.id);
      
      -- Check and award badge
      PERFORM check_provider_badges(v_provider.id);
      
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      RAISE WARNING 'Error initializing points for provider %: %', v_provider.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
