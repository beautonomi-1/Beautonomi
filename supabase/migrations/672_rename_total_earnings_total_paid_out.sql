-- Beautonomi Database Migration
-- 672_rename_total_earnings_total_paid_out.sql
-- providers.total_earnings tracked completed payout sums (misnomer). Rename and repoint gamification earnings to ledger.

ALTER TABLE public.providers
  RENAME COLUMN total_earnings TO total_paid_out;

COMMENT ON COLUMN public.providers.total_paid_out IS
  'Sum of net_amount for completed payouts (maintained by update_provider_total_paid_out trigger). Not recognized earnings.';

-- Helper: recognized provider earnings from finance ledger (matches aggregate-finance-ledger-rows semantics).
CREATE OR REPLACE FUNCTION public.get_provider_recognized_earnings(p_provider_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(net), 0)
  FROM public.finance_transactions
  WHERE provider_id = p_provider_id
    AND transaction_type = 'provider_earnings';
$$;

COMMENT ON FUNCTION public.get_provider_recognized_earnings(UUID) IS
  'Sum of provider_earnings net from finance_transactions for gamification / reporting (not payout totals).';

-- Payout completion trigger: maintain total_paid_out (was misnamed total_earnings).
CREATE OR REPLACE FUNCTION public.update_provider_total_paid_out()
RETURNS TRIGGER AS $$
DECLARE
  v_paid_out NUMERIC(10, 2);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    SELECT COALESCE(SUM(net_amount), 0)
    INTO v_paid_out
    FROM public.payouts
    WHERE provider_id = NEW.provider_id
      AND status = 'completed';

    UPDATE public.providers
    SET total_paid_out = v_paid_out
    WHERE id = NEW.provider_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    SELECT COALESCE(SUM(net_amount), 0)
    INTO v_paid_out
    FROM public.payouts
    WHERE provider_id = NEW.provider_id
      AND status = 'completed';

    UPDATE public.providers
    SET total_paid_out = v_paid_out
    WHERE id = NEW.provider_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_payout_status_update_earnings ON public.payouts;
DROP FUNCTION IF EXISTS public.update_provider_earnings();

CREATE TRIGGER on_payout_status_update_total_paid_out
  AFTER INSERT OR UPDATE ON public.payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_provider_total_paid_out();

-- Recompute denormalized totals once after rename.
UPDATE public.providers p
SET total_paid_out = COALESCE(
  (
    SELECT SUM(po.net_amount)
    FROM public.payouts po
    WHERE po.provider_id = p.id
      AND po.status = 'completed'
  ),
  0
);

-- Gamification: earnings bonus from ledger, not paid-out totals.
CREATE OR REPLACE FUNCTION public.calculate_provider_points(p_provider_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER := 0;
  v_bookings INTEGER;
  v_reviews INTEGER;
  v_rating NUMERIC;
  v_earnings NUMERIC;
  v_booking_pts INTEGER;
  v_review_pts INTEGER;
BEGIN
  v_booking_pts := get_provider_point_rule_points('booking_completed');
  IF v_booking_pts <= 0 THEN v_booking_pts := 10; END IF;
  v_review_pts := get_provider_point_rule_points('review_received');
  IF v_review_pts <= 0 THEN v_review_pts := 5; END IF;

  SELECT
    COALESCE(total_bookings, 0),
    COALESCE(review_count, 0),
    COALESCE(rating_average, 0)
  INTO v_bookings, v_reviews, v_rating
  FROM public.providers
  WHERE id = p_provider_id;

  v_earnings := public.get_provider_recognized_earnings(p_provider_id);

  v_points := v_points + (v_bookings * v_booking_pts);
  v_points := v_points + (v_reviews * v_review_pts);
  IF v_rating >= 4.0 THEN
    v_points := v_points + (FLOOR((v_rating - 4.0) / 0.5)::INTEGER * 50);
  END IF;
  v_points := v_points + (FLOOR(v_earnings / 100)::INTEGER);

  RETURN v_points;
END;
$$ LANGUAGE plpgsql;

-- Provider stats trigger: watch total_paid_out column name (payout totals no longer drive earnings points).
CREATE OR REPLACE FUNCTION public.trigger_recalculate_provider_gamification()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (
      OLD.total_bookings IS DISTINCT FROM NEW.total_bookings OR
      OLD.review_count IS DISTINCT FROM NEW.review_count OR
      OLD.rating_average IS DISTINCT FROM NEW.rating_average OR
      OLD.total_paid_out IS DISTINCT FROM NEW.total_paid_out
    ) THEN
      BEGIN
        PERFORM recalculate_provider_gamification(NEW.id);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error recalculating gamification for provider %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_recalculate_gamification_trigger ON public.providers;
CREATE TRIGGER providers_recalculate_gamification_trigger
  AFTER UPDATE ON public.providers
  FOR EACH ROW
  WHEN (
    OLD.total_bookings IS DISTINCT FROM NEW.total_bookings OR
    OLD.review_count IS DISTINCT FROM NEW.review_count OR
    OLD.rating_average IS DISTINCT FROM NEW.rating_average OR
    OLD.total_paid_out IS DISTINCT FROM NEW.total_paid_out
  )
  EXECUTE FUNCTION public.trigger_recalculate_provider_gamification();
