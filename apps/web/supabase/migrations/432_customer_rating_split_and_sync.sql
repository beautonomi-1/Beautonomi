-- Split customer rating sources on users + single sync for combined display columns.
-- reviews.customer_rating → customer_review_* ; provider_client_ratings → customer_booking_*
-- users.rating_average + review_count = weighted combined (backward compatible for list UIs).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS customer_review_rating_avg NUMERIC(3, 2) DEFAULT 0
    CHECK (customer_review_rating_avg >= 0 AND customer_review_rating_avg <= 5),
  ADD COLUMN IF NOT EXISTS customer_review_rating_count INTEGER DEFAULT 0
    CHECK (customer_review_rating_count >= 0),
  ADD COLUMN IF NOT EXISTS customer_booking_rating_avg NUMERIC(3, 2) DEFAULT 0
    CHECK (customer_booking_rating_avg >= 0 AND customer_booking_rating_avg <= 5),
  ADD COLUMN IF NOT EXISTS customer_booking_rating_count INTEGER DEFAULT 0
    CHECK (customer_booking_rating_count >= 0);

COMMENT ON COLUMN users.customer_review_rating_avg IS 'Avg stars from reviews.customer_rating (written reviews)';
COMMENT ON COLUMN users.customer_review_rating_count IS 'Count of reviews with customer_rating set';
COMMENT ON COLUMN users.customer_booking_rating_avg IS 'Avg stars from provider_client_ratings (per booking)';
COMMENT ON COLUMN users.customer_booking_rating_count IS 'Count of visible provider_client_ratings';
COMMENT ON COLUMN users.rating_average IS 'Weighted combined avg of review + booking ratings (display)';
COMMENT ON COLUMN users.review_count IS 'Total count: review ratings + booking ratings (display)';

CREATE OR REPLACE FUNCTION sync_customer_rating_aggregates(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  r_avg NUMERIC(3, 2);
  r_cnt INTEGER;
  b_avg NUMERIC(3, 2);
  b_cnt INTEGER;
  comb_avg NUMERIC(3, 2);
  comb_cnt INTEGER;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(AVG(customer_rating), 0)::NUMERIC(3, 2),
    COUNT(*)::INTEGER
  INTO r_avg, r_cnt
  FROM reviews
  WHERE customer_id = p_customer_id
    AND customer_rating IS NOT NULL;

  SELECT
    COALESCE(AVG(rating), 0)::NUMERIC(3, 2),
    COUNT(*)::INTEGER
  INTO b_avg, b_cnt
  FROM provider_client_ratings
  WHERE customer_id = p_customer_id
    AND is_visible = true;

  comb_cnt := COALESCE(r_cnt, 0) + COALESCE(b_cnt, 0);
  IF comb_cnt > 0 THEN
    comb_avg := (
      COALESCE(r_avg, 0) * COALESCE(r_cnt, 0) + COALESCE(b_avg, 0) * COALESCE(b_cnt, 0)
    ) / comb_cnt;
  ELSE
    comb_avg := 0;
  END IF;

  UPDATE users
  SET
    customer_review_rating_avg = COALESCE(r_avg, 0),
    customer_review_rating_count = COALESCE(r_cnt, 0),
    customer_booking_rating_avg = COALESCE(b_avg, 0),
    customer_booking_rating_count = COALESCE(b_cnt, 0),
    rating_average = comb_avg,
    review_count = comb_cnt
  WHERE id = p_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_customer_rating_from_reviews()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_customer_rating_aggregates(OLD.customer_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM sync_customer_rating_aggregates(OLD.customer_id);
  END IF;
  PERFORM sync_customer_rating_aggregates(NEW.customer_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_customer_rating_from_provider_client_ratings()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_customer_rating_aggregates(OLD.customer_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM sync_customer_rating_aggregates(OLD.customer_id);
  END IF;
  PERFORM sync_customer_rating_aggregates(NEW.customer_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers already exist from 422; replace function bodies only (done above).
-- Backfill all customers who appear in either source.
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT DISTINCT customer_id AS id FROM reviews WHERE customer_id IS NOT NULL
    UNION
    SELECT DISTINCT customer_id AS id FROM provider_client_ratings WHERE customer_id IS NOT NULL
  LOOP
    PERFORM sync_customer_rating_aggregates(u.id);
  END LOOP;
END;
$$;
