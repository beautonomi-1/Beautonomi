-- Widen service-fee validation to match customer/provider fee bases; allow booking insert when no cancellation policy row.

CREATE OR REPLACE FUNCTION validate_service_fee_calculation()
RETURNS TRIGGER AS $$
DECLARE
  calculated_fee NUMERIC(10, 2);
  net_discounts NUMERIC(18, 4);
  base_after_discounts NUMERIC(18, 4);
  base_with_travel NUMERIC(18, 4);
BEGIN
  IF NEW.service_fee_percentage IS NOT NULL
     AND NEW.service_fee_percentage > 0
     AND NEW.subtotal IS NOT NULL
     AND NEW.subtotal > 0
     AND NEW.service_fee_amount IS NOT NULL THEN

    calculated_fee := ROUND((NEW.subtotal * NEW.service_fee_percentage / 100)::NUMERIC, 2);
    IF ABS(NEW.service_fee_amount - calculated_fee) <= 0.01 THEN
      RETURN NEW;
    END IF;

    net_discounts :=
      COALESCE(NEW.subtotal, 0)
      - COALESCE(NEW.discount_amount, 0)
      - COALESCE(NEW.promotion_discount_amount, 0)
      - COALESCE(NEW.membership_discount_amount, 0)
      - COALESCE(NEW.loyalty_discount_amount, 0);

    base_after_discounts := GREATEST(net_discounts, 0);
    calculated_fee := ROUND((base_after_discounts * NEW.service_fee_percentage / 100)::NUMERIC, 2);
    IF ABS(NEW.service_fee_amount - calculated_fee) <= 0.01 THEN
      RETURN NEW;
    END IF;

    base_with_travel := base_after_discounts + COALESCE(NEW.travel_fee, 0);
    calculated_fee := ROUND((base_with_travel * NEW.service_fee_percentage / 100)::NUMERIC, 2);
    IF ABS(NEW.service_fee_amount - calculated_fee) <= 0.01 THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Service fee calculation validation failed. Expected one of: %s (subtotal), %s (after discounts), %s (after discounts + travel) from subtotal %s and percentage %s, but service_fee_amount is %s',
        ROUND((NEW.subtotal * NEW.service_fee_percentage / 100)::NUMERIC, 2),
        ROUND((base_after_discounts * NEW.service_fee_percentage / 100)::NUMERIC, 2),
        calculated_fee,
        NEW.subtotal,
        NEW.service_fee_percentage,
        NEW.service_fee_amount
      ),
      HINT = 'Ensure service_fee_amount matches subtotal, post-discount base, or post-discount base plus travel_fee times percentage.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_service_fee_calculation IS
  'Validates service_fee_amount against subtotal, post-discount base, or post-discount base plus travel_fee when percentage > 0.';

CREATE OR REPLACE FUNCTION public.set_booking_cancellation_policy_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy RECORD;
  v_provider RECORD;
BEGIN
  IF NEW.cancellation_policy_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT cp.* INTO v_policy
  FROM public.cancellation_policies cp
  WHERE cp.provider_id = NEW.provider_id
    AND cp.is_active = true
    AND (
      cp.location_type = NEW.location_type::text
      OR cp.location_type IS NULL
    )
  ORDER BY
    CASE WHEN cp.location_type = NEW.location_type::text THEN 0 ELSE 1 END,
    cp.is_default DESC,
    cp.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT
    p.requires_deposit,
    p.deposit_percentage,
    p.no_show_fee_enabled,
    p.no_show_fee_amount
  INTO v_provider
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  NEW.cancellation_policy_snapshot := jsonb_build_object(
    'policy_id', v_policy.id,
    'hours_before_cutoff', COALESCE(v_policy.hours_before, v_policy.hours_before_cutoff, 24),
    'grace_window_minutes', COALESCE(v_policy.grace_window_minutes, 15),
    'refund_percentage', COALESCE(v_policy.refund_percentage, 50),
    'fee_amount', COALESCE(v_policy.fee_amount, 0),
    'fee_type', COALESCE(v_policy.fee_type, 'fixed'),
    'policy_text', v_policy.policy_text,
    'requires_deposit', COALESCE(v_provider.requires_deposit, false),
    'deposit_percentage', COALESCE(v_provider.deposit_percentage, 0),
    'no_show_fee_enabled', COALESCE(v_provider.no_show_fee_enabled, false),
    'no_show_fee_amount', COALESCE(v_provider.no_show_fee_amount, 0)
  );

  RETURN NEW;
END;
$$;
