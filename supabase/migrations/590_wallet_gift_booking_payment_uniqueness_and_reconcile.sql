-- Enforce synthetic wallet/gift booking payment idempotency and reconcile
-- booking payment totals after pricing/payment migrations.

-- Fix enum-cast crash in award_loyalty_points_on_booking_completion (migrations 421 + 585).
-- COALESCE(OLD.status, '') forces PostgreSQL to cast '' to booking_status enum → 22P02.
-- Cast to TEXT first so the empty-string sentinel is valid.
CREATE OR REPLACE FUNCTION public.award_loyalty_points_on_booking_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_amount numeric;
  v_points_per_unit numeric := 1;
  v_points_earned integer := 0;
BEGIN
  IF NEW.status <> 'completed' OR COALESCE(OLD.status::TEXT, '') = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.loyalty_points_ledger l
    WHERE l.booking_id = NEW.id
      AND l.transaction_type = 'earned'
  ) THEN
    RETURN NEW;
  END IF;

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

  PERFORM public.append_loyalty_ledger_entry(
    NEW.customer_id,
    'earned',
    v_points_earned,
    NEW.id,
    CONCAT('Points earned for completed booking ', COALESCE(NEW.booking_number::text, NEW.id::text)),
    '{}'::jsonb,
    NULL
  );

  UPDATE public.bookings
  SET loyalty_points_earned = v_points_earned
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.award_loyalty_points_on_booking_completion IS
  'Awards loyalty points on booking status → completed. Fixed in migration 590: COALESCE(OLD.status::TEXT, ...) prevents 22P02 enum cast crash.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT payment_provider, payment_provider_id, COUNT(*) AS c
      FROM public.booking_payments
      WHERE payment_provider IN ('wallet', 'gift_card')
        AND payment_provider_id IS NOT NULL
        AND btrim(payment_provider_id) <> ''
        AND (
          payment_provider_id LIKE 'wallet_booking:%'
          OR payment_provider_id LIKE 'gift_card_booking:%'
        )
      GROUP BY payment_provider, payment_provider_id
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION
      'booking_payments: duplicate wallet/gift synthetic rows for same payment_provider_id; dedupe before migration 590';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_wallet_gift_provider_id_uidx
  ON public.booking_payments (payment_provider, payment_provider_id)
  WHERE payment_provider IN ('wallet', 'gift_card')
    AND payment_provider_id IS NOT NULL
    AND btrim(payment_provider_id) <> ''
    AND (
      payment_provider_id LIKE 'wallet_booking:%'
      OR payment_provider_id LIKE 'gift_card_booking:%'
    );

COMMENT ON INDEX public.booking_payments_wallet_gift_provider_id_uidx IS
  'Idempotent wallet/gift synthetic booking payments: one row per wallet_booking:/gift_card_booking: provider id.';

-- `update_booking_payment_status` is fired by booking_payments/booking_refunds,
-- not by bookings.total_amount changes. Recompute every booking once after the
-- pricing normalization + trigger-hardening migrations so stored totals and
-- payment_status agree with the current function semantics.
WITH paid_totals AS (
  SELECT
    booking_id,
    COALESCE(SUM(amount), 0)::NUMERIC AS total_paid
  FROM public.booking_payments
  WHERE status::TEXT IN ('completed', 'partially_refunded')
  GROUP BY booking_id
),
refund_totals AS (
  SELECT
    booking_id,
    COALESCE(SUM(amount), 0)::NUMERIC AS total_refunded
  FROM public.booking_refunds
  WHERE status::TEXT = 'completed'
  GROUP BY booking_id
),
payment_totals AS (
  SELECT
    b.id AS booking_id,
    COALESCE(pt.total_paid, 0)::NUMERIC AS total_paid,
    COALESCE(rt.total_refunded, 0)::NUMERIC AS total_refunded,
    b.total_amount
  FROM public.bookings b
  LEFT JOIN paid_totals pt ON pt.booking_id = b.id
  LEFT JOIN refund_totals rt ON rt.booking_id = b.id
),
derived AS (
  SELECT
    booking_id,
    total_paid,
    total_refunded,
    CASE
      WHEN total_paid = 0 THEN 'pending'
      WHEN total_refunded >= total_paid THEN 'refunded'
      WHEN total_amount IS NOT NULL AND total_paid + 0.01 >= total_amount THEN
        CASE WHEN total_refunded > 0 THEN 'partially_refunded' ELSE 'paid' END
      WHEN total_paid > 0 THEN 'partially_paid'
      ELSE 'pending'
    END AS payment_status
  FROM payment_totals
)
UPDATE public.bookings b
SET
  total_paid = d.total_paid,
  total_refunded = d.total_refunded,
  payment_status = d.payment_status::payment_status
FROM derived d
WHERE b.id = d.booking_id
  AND (
    COALESCE(b.total_paid, 0) IS DISTINCT FROM d.total_paid
    OR COALESCE(b.total_refunded, 0) IS DISTINCT FROM d.total_refunded
    OR b.payment_status::TEXT IS DISTINCT FROM d.payment_status
  );
