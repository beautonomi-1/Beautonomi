-- =============================================================================
-- 10142_booking_total_paycloud_entitlement.sql
-- F2-04  UNIQUE on paycloud_webhook_events (Yoco UNIQUE is in 10138)
-- F2-13  validate_booking_total: one formula, driven by tax_inclusive
-- F2-46  get_provider_subscription_tier / provider_has_feature_access wrap
--        get_provider_subscription_plan (same grace as 10101)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- F2-04  PayCloud webhook event uniqueness
-- Key is merchant_order_no + event_type for signature-valid rows so a later
-- status change for the same order is still insertable, while retries of the
-- same notify cannot double-insert. Invalid-signature floods stay unindexed.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS paycloud_webhook_events_order_event_uidx
      ON public.paycloud_webhook_events (merchant_order_no, event_type)
      WHERE merchant_order_no IS NOT NULL
        AND btrim(merchant_order_no) <> ''
        AND COALESCE(signature_valid, false) = true;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'paycloud_webhook_events has duplicate (merchant_order_no, event_type) rows; index not created (F2-04). De-duplicate then re-run.';
  END;
END $$;

-- -----------------------------------------------------------------------------
-- F2-13  Single booking total formula
-- tax_inclusive IS TRUE  (ZA default) → VAT already in subtotal; do not add tax
-- tax_inclusive IS FALSE             → add tax_amount
-- NULL tax_inclusive treated as TRUE (same default as 10102 resolve_tax_rate)
-- Promo / membership / loyalty discounts always netted (no discount-only alt)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_booking_total()
RETURNS TRIGGER AS $$
DECLARE
  net_all NUMERIC(18, 4);
  expected NUMERIC(18, 4);
  v_inclusive BOOLEAN;
  component_breakdown TEXT;
BEGIN
  v_inclusive := COALESCE(NEW.tax_inclusive, true);

  net_all :=
    COALESCE(NEW.subtotal, 0)
    - COALESCE(NEW.discount_amount, 0)
    - COALESCE(NEW.promotion_discount_amount, 0)
    - COALESCE(NEW.membership_discount_amount, 0)
    - COALESCE(NEW.loyalty_discount_amount, 0);

  expected :=
    net_all
    + CASE WHEN v_inclusive THEN 0 ELSE COALESCE(NEW.tax_amount, 0) END
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  IF ABS(NEW.total_amount - expected) <= 0.01 THEN
    RETURN NEW;
  END IF;

  component_breakdown := format(
    'Subtotal: %s, Discount: %s, Promo: %s, Membership: %s, Loyalty: %s, Tax: %s, Service Fee: %s, Travel: %s, Tip: %s, Cancellation Fee: %s, tax_inclusive: %s — expected total %s, but total_amount is %s',
    COALESCE(NEW.subtotal, 0),
    COALESCE(NEW.discount_amount, 0),
    COALESCE(NEW.promotion_discount_amount, 0),
    COALESCE(NEW.membership_discount_amount, 0),
    COALESCE(NEW.loyalty_discount_amount, 0),
    COALESCE(NEW.tax_amount, 0),
    COALESCE(NEW.service_fee_amount, 0),
    COALESCE(NEW.travel_fee, 0),
    COALESCE(NEW.tip_amount, 0),
    COALESCE(NEW.cancellation_fee, 0),
    v_inclusive,
    expected,
    NEW.total_amount
  );

  RAISE EXCEPTION 'Total amount validation failed. %', component_breakdown
    USING ERRCODE = '23514',
          HINT = 'total_amount must equal subtotal minus all discounts plus fees/travel/tip minus cancellation; add tax_amount only when tax_inclusive is false.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.validate_booking_total IS
  'Ensures total_amount matches a single formula: all discounts, VAT-inclusive when tax_inclusive, otherwise tax-exclusive. Tolerance ±0.01.';

DROP TRIGGER IF EXISTS validate_booking_total_trigger ON public.bookings;
CREATE TRIGGER validate_booking_total_trigger
  BEFORE INSERT OR UPDATE OF
    subtotal,
    discount_amount,
    promotion_discount_amount,
    membership_discount_amount,
    loyalty_discount_amount,
    tax_amount,
    service_fee_amount,
    travel_fee,
    tip_amount,
    cancellation_fee,
    total_amount,
    tax_inclusive
  ON public.bookings
  FOR EACH ROW
  WHEN (
    NEW.subtotal IS NOT NULL
    AND NEW.total_amount IS NOT NULL
  )
  EXECUTE FUNCTION public.validate_booking_total();

-- -----------------------------------------------------------------------------
-- F2-46  Entitlement RPCs share 10101 grace (past_due / Apple / scheduled)
-- Badge overlay only when the canonical plan is the free fallback.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_provider_subscription_tier(provider_id_param UUID)
RETURNS TABLE (
  plan_id UUID,
  plan_name TEXT,
  is_free BOOLEAN,
  features JSONB,
  max_bookings_per_month INTEGER,
  max_staff_members INTEGER,
  max_locations INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  RETURN QUERY
  SELECT
    p.plan_id,
    p.plan_name,
    p.is_free,
    p.features,
    p.max_bookings_per_month,
    p.max_staff_members,
    p.max_locations
  FROM public.get_provider_subscription_plan(provider_id_param) p
  WHERE p.is_free IS NOT TRUE;

  IF FOUND THEN
    RETURN;
  END IF;

  v_status := public.get_provider_subscription_status(provider_id_param);
  IF v_status = 'active' THEN
    RETURN QUERY
    SELECT
      sp.id,
      sp.name,
      COALESCE(sp.is_free, true),
      COALESCE(sp.features, '[]'::jsonb),
      sp.max_bookings_per_month,
      sp.max_staff_members,
      sp.max_locations
    FROM public.subscription_plans sp
    WHERE sp.is_free = true
      AND sp.is_active = true
    ORDER BY sp.display_order
    LIMIT 1;
    IF FOUND THEN
      RETURN;
    END IF;
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

  RETURN QUERY
  SELECT
    p.plan_id,
    p.plan_name,
    p.is_free,
    p.features,
    p.max_bookings_per_month,
    p.max_staff_members,
    p.max_locations
  FROM public.get_provider_subscription_plan(provider_id_param) p;
END;
$$;

COMMENT ON FUNCTION public.get_provider_subscription_tier(UUID) IS
  'Alias of get_provider_subscription_plan (10101 grace) with badge overlay only on the free fallback.';

CREATE OR REPLACE FUNCTION public.provider_has_feature_access(
  provider_id_param UUID,
  feature_key_param TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_features JSONB;
  v_is_free BOOLEAN;
  v_status TEXT;
BEGIN
  SELECT p.features, p.is_free
    INTO v_features, v_is_free
  FROM public.get_provider_subscription_plan(provider_id_param) p
  LIMIT 1;

  IF v_is_free IS NOT TRUE THEN
    RETURN COALESCE(v_features ? feature_key_param, false)
      OR (COALESCE(v_features::text, '') LIKE '%' || feature_key_param || '%');
  END IF;

  v_status := public.get_provider_subscription_status(provider_id_param);
  IF v_status = 'active' THEN
    RETURN feature_key_param IN (
      'booking_online',
      'reviews_ratings',
      'basic_analytics'
    );
  END IF;

  RETURN COALESCE(v_features ? feature_key_param, false)
    OR (COALESCE(v_features::text, '') LIKE '%' || feature_key_param || '%');
END;
$$;

COMMENT ON FUNCTION public.provider_has_feature_access(UUID, TEXT) IS
  'Feature check via get_provider_subscription_plan grace; badge overlay only on the free fallback.';

REVOKE ALL ON FUNCTION public.get_provider_subscription_tier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_subscription_tier(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provider_has_feature_access(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_has_feature_access(UUID, TEXT) TO authenticated, service_role;
