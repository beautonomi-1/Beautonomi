-- Apply loyalty_point_config.bonus_multipliers on the live earn trigger.
-- first_booking multiplies the booking earn. birthday adds a separate bonus row.
-- Refunds and un-complete reverse both the earned row and that booking's bonus.

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
  v_birthday_bonus integer := 0;
  v_first_multiplier numeric := 1;
  v_multipliers jsonb := '{}'::jsonb;
  v_dob date;
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

    SELECT COALESCE(c.bonus_multipliers, '{}'::jsonb)
    INTO v_multipliers
    FROM public.loyalty_point_config c
    WHERE c.is_active = true
    ORDER BY c.created_at DESC
    LIMIT 1;

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
      v_first_multiplier := COALESCE((v_multipliers->>'first_booking')::numeric, 1);
      IF v_first_multiplier < 1 THEN
        v_first_multiplier := 1;
      END IF;

      IF v_first_multiplier > 1 AND NOT EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.customer_id = NEW.customer_id
          AND b.id <> NEW.id
          AND b.status = 'completed'
      ) THEN
        v_points_earned := FLOOR(v_base_amount * v_points_per_unit * v_first_multiplier)::integer;
      ELSE
        v_points_earned := FLOOR(v_base_amount * v_points_per_unit)::integer;
        v_first_multiplier := 1;
      END IF;
    END IF;

    v_birthday_bonus := GREATEST(0, COALESCE((v_multipliers->>'birthday')::integer, 0));
    IF v_birthday_bonus > 0 THEN
      SELECT u.date_of_birth INTO v_dob
      FROM public.users u
      WHERE u.id = NEW.customer_id;

      IF v_dob IS NULL
         OR EXTRACT(MONTH FROM v_dob) IS DISTINCT FROM EXTRACT(MONTH FROM timezone('UTC', now()))
         OR EXTRACT(DAY FROM v_dob) IS DISTINCT FROM EXTRACT(DAY FROM timezone('UTC', now()))
         OR EXISTS (
           SELECT 1
           FROM public.loyalty_points_ledger l
           WHERE l.customer_id = NEW.customer_id
             AND l.transaction_type = 'bonus'
             AND l.metadata->>'source' = 'birthday_bonus'
             AND l.created_at >= date_trunc('year', timezone('UTC', now()))
         ) THEN
        v_birthday_bonus := 0;
      END IF;
    END IF;

    IF v_points_earned > 0 THEN
      PERFORM public.append_loyalty_ledger_entry(
        NEW.customer_id,
        'earned',
        v_points_earned,
        NEW.id,
        CONCAT('Points earned for completed booking ', COALESCE(NEW.booking_number::text, NEW.id::text)),
        jsonb_build_object('first_booking_multiplier', v_first_multiplier),
        NULL
      );
    END IF;

    IF v_birthday_bonus > 0 THEN
      PERFORM public.append_loyalty_ledger_entry(
        NEW.customer_id,
        'bonus',
        v_birthday_bonus,
        NEW.id,
        'Birthday bonus points',
        jsonb_build_object('source', 'birthday_bonus'),
        NULL
      );
    END IF;

    IF v_points_earned + v_birthday_bonus > 0 THEN
      UPDATE public.bookings
      SET loyalty_points_earned = v_points_earned + v_birthday_bonus
      WHERE id = NEW.id;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')
       OR (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded') THEN
      SELECT COALESCE(SUM(points_amount), 0)::integer INTO v_existing_earned
      FROM public.loyalty_points_ledger
      WHERE booking_id = NEW.id
        AND customer_id = NEW.customer_id
        AND transaction_type IN ('earned', 'bonus');

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
  'Earn on completed, including configured first-booking multiplier and birthday bonus. One earn_clawback reverses earned and bonus rows for that booking.';
