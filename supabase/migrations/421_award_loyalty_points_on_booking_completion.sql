-- Ensure loyalty points are awarded whenever a booking transitions to completed,
-- regardless of which API/path performed the status update.

CREATE OR REPLACE FUNCTION public.award_loyalty_points_on_booking_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_tx_id UUID;
  v_base_amount NUMERIC;
  v_points_per_unit NUMERIC := 1;
  v_points_earned INTEGER := 0;
BEGIN
  -- Only award on status transition into completed.
  IF NEW.status <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: one earned booking transaction per booking.
  SELECT id
  INTO v_existing_tx_id
  FROM public.loyalty_point_transactions
  WHERE reference_id = NEW.id
    AND reference_type = 'booking'
    AND transaction_type = 'earned'
  LIMIT 1;

  IF v_existing_tx_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Prefer subtotal; otherwise derive from total to avoid zero-point misses.
  v_base_amount := COALESCE(NEW.subtotal, 0);
  IF v_base_amount <= 0 THEN
    v_base_amount := GREATEST(
      0,
      COALESCE(NEW.total_amount, 0)
      - COALESCE(NEW.tax_amount, 0)
      - COALESCE(NEW.service_fee_amount, 0)
      - COALESCE(NEW.tip_amount, 0)
      - COALESCE(NEW.travel_fee, 0)
      + COALESCE(NEW.discount_amount, 0)
    );
  END IF;

  IF v_base_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Currency-aware active rule first; fallback to latest active rule; then 1:1.
  SELECT lr.points_per_currency_unit
  INTO v_points_per_unit
  FROM public.loyalty_rules lr
  WHERE lr.is_active = true
    AND (lr.currency = NEW.currency OR NEW.currency IS NULL)
  ORDER BY lr.effective_from DESC
  LIMIT 1;

  IF v_points_per_unit IS NULL THEN
    SELECT lr.points_per_currency_unit
    INTO v_points_per_unit
    FROM public.loyalty_rules lr
    WHERE lr.is_active = true
    ORDER BY lr.effective_from DESC
    LIMIT 1;
  END IF;

  v_points_per_unit := COALESCE(v_points_per_unit, 1);
  v_points_earned := FLOOR(v_base_amount * v_points_per_unit);

  IF v_points_earned <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.loyalty_point_transactions (
    user_id,
    transaction_type,
    points,
    description,
    reference_id,
    reference_type,
    expires_at
  )
  VALUES (
    NEW.customer_id,
    'earned',
    v_points_earned,
    CONCAT('Points earned for completed booking ', COALESCE(NEW.booking_number::text, NEW.id::text)),
    NEW.id,
    'booking',
    NULL
  );

  UPDATE public.bookings
  SET loyalty_points_earned = v_points_earned
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_loyalty_points_on_booking_completion ON public.bookings;
CREATE TRIGGER trg_award_loyalty_points_on_booking_completion
AFTER UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.award_loyalty_points_on_booking_completion();

-- Backfill points for already-completed bookings that do not yet have an earned loyalty transaction.
WITH candidates AS (
  SELECT
    b.id,
    b.customer_id,
    b.booking_number,
    GREATEST(
      0,
      COALESCE(
        b.subtotal,
        COALESCE(b.total_amount, 0)
          - COALESCE(b.tax_amount, 0)
          - COALESCE(b.service_fee_amount, 0)
          - COALESCE(b.tip_amount, 0)
          - COALESCE(b.travel_fee, 0)
          + COALESCE(b.discount_amount, 0)
      )
    ) AS base_amount,
    COALESCE(
      (
        SELECT lr.points_per_currency_unit
        FROM public.loyalty_rules lr
        WHERE lr.is_active = true
          AND lr.currency = b.currency
        ORDER BY lr.effective_from DESC
        LIMIT 1
      ),
      (
        SELECT lr.points_per_currency_unit
        FROM public.loyalty_rules lr
        WHERE lr.is_active = true
        ORDER BY lr.effective_from DESC
        LIMIT 1
      ),
      1
    ) AS points_per_unit
  FROM public.bookings b
  WHERE b.status = 'completed'
    AND b.customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.loyalty_point_transactions lpt
      WHERE lpt.reference_id = b.id
        AND lpt.reference_type = 'booking'
        AND lpt.transaction_type = 'earned'
    )
),
awards AS (
  SELECT
    c.id AS booking_id,
    c.customer_id,
    c.booking_number,
    FLOOR(c.base_amount * c.points_per_unit)::INTEGER AS points_earned
  FROM candidates c
  WHERE c.base_amount > 0
)
INSERT INTO public.loyalty_point_transactions (
  user_id,
  transaction_type,
  points,
  description,
  reference_id,
  reference_type,
  expires_at
)
SELECT
  a.customer_id,
  'earned',
  a.points_earned,
  CONCAT('Points earned for completed booking ', COALESCE(a.booking_number::text, a.booking_id::text)),
  a.booking_id,
  'booking',
  NULL
FROM awards a
WHERE a.points_earned > 0;

UPDATE public.bookings b
SET loyalty_points_earned = a.points_earned
FROM (
  SELECT
    lpt.reference_id AS booking_id,
    MAX(lpt.points) AS points_earned
  FROM public.loyalty_point_transactions lpt
  WHERE lpt.reference_type = 'booking'
    AND lpt.transaction_type = 'earned'
  GROUP BY lpt.reference_id
) a
WHERE b.id = a.booking_id
  AND COALESCE(b.loyalty_points_earned, 0) <> COALESCE(a.points_earned, 0);
