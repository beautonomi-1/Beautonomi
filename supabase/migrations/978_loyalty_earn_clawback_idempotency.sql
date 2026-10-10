-- One earn clawback per booking; block negative adjusted debits that exceed balance (mirror redeemed).

CREATE OR REPLACE FUNCTION public.append_loyalty_ledger_entry(
  p_customer_id uuid,
  p_transaction_type text,
  p_points_amount integer,
  p_booking_id uuid,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_sum integer;
  v_new_balance integer;
  v_desc text := COALESCE(NULLIF(BTRIM(p_description), ''), 'Points transaction');
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'append_loyalty_ledger_entry: customer_id required';
  END IF;
  IF p_transaction_type IS NULL
    OR p_transaction_type NOT IN ('earned', 'redeemed', 'expired', 'adjusted', 'bonus') THEN
    RAISE EXCEPTION 'append_loyalty_ledger_entry: invalid transaction_type %', p_transaction_type;
  END IF;
  IF p_points_amount IS NULL THEN
    RAISE EXCEPTION 'append_loyalty_ledger_entry: points_amount required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text), 0);

  SELECT COALESCE(SUM(points_amount), 0)::integer INTO v_sum
  FROM public.loyalty_points_ledger
  WHERE customer_id = p_customer_id
    AND (expires_at IS NULL OR expires_at > now());

  IF p_points_amount < 0
     AND p_transaction_type IN ('redeemed', 'adjusted')
     AND (v_sum + p_points_amount) < 0 THEN
    RAISE EXCEPTION 'insufficient_loyalty_balance';
  END IF;

  v_new_balance := GREATEST(0, v_sum + p_points_amount);

  INSERT INTO public.loyalty_points_ledger (
    id,
    customer_id,
    transaction_type,
    points_amount,
    balance_after,
    booking_id,
    description,
    metadata,
    expires_at
  )
  VALUES (
    v_id,
    p_customer_id,
    p_transaction_type,
    p_points_amount,
    v_new_balance,
    p_booking_id,
    v_desc,
    COALESCE(p_metadata, '{}'::jsonb),
    p_expires_at
  );

  RETURN v_id;
END;
$$;

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
  v_existing_earned integer;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM 'refunded'
     AND (
       (TG_OP = 'INSERT' AND NEW.status = 'completed')
       OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
       OR (
         TG_OP = 'UPDATE'
         AND NEW.status = 'completed'
         AND OLD.status = 'completed'
         AND OLD.payment_status IS DISTINCT FROM NEW.payment_status
         AND NOT EXISTS (
           SELECT 1 FROM public.loyalty_points_ledger l
           WHERE l.booking_id = NEW.id AND l.transaction_type = 'earned'
         )
       )
     ) THEN
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

    IF v_base_amount > 0 THEN
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

      IF v_points_earned > 0 THEN
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
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
       OR (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded') THEN
      SELECT COALESCE(SUM(points_amount), 0)::integer INTO v_existing_earned
      FROM public.loyalty_points_ledger
      WHERE booking_id = NEW.id
        AND customer_id = NEW.customer_id
        AND transaction_type = 'earned';

      IF v_existing_earned > 0
         AND NOT EXISTS (
           SELECT 1 FROM public.loyalty_points_ledger l
           WHERE l.booking_id = NEW.id
             AND l.customer_id = NEW.customer_id
             AND l.transaction_type = 'adjusted'
             AND l.points_amount < 0
         ) THEN
        PERFORM public.append_loyalty_ledger_entry(
          NEW.customer_id,
          'adjusted',
          -v_existing_earned,
          NEW.id,
          CONCAT('Points reversed for booking ', COALESCE(NEW.booking_number::text, NEW.id::text)),
          jsonb_build_object('source', 'earn_clawback'),
          NULL
        );
        UPDATE public.bookings SET loyalty_points_earned = 0 WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.award_loyalty_points_on_booking_completion IS
  '978: Earn on completed; single earn_clawback adjusted debit when leaving completed or payment refunded.';
