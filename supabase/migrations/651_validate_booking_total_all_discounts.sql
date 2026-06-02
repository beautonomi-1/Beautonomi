-- 651: validate_booking_total — accept promo/membership/loyalty discounts
--
-- The 579 formula only subtracted `discount_amount`, so a booking whose
-- total_amount also nets out promotion / membership / loyalty discounts (the
-- canonical invariant documented in migration 583) would fail validation.
--
-- To avoid newly rejecting any row that previously passed, this is STRICTLY MORE
-- LENIENT: total_amount may match the old discount-only formula OR a new
-- all-discounts formula, each in tax-exclusive or VAT-inclusive style.

CREATE OR REPLACE FUNCTION validate_booking_total()
RETURNS TRIGGER AS $$
DECLARE
  net_discount_only NUMERIC(18, 4);
  net_all_discounts NUMERIC(18, 4);
  excl_discount_only NUMERIC(18, 4);
  incl_discount_only NUMERIC(18, 4);
  excl_all_discounts NUMERIC(18, 4);
  incl_all_discounts NUMERIC(18, 4);
  component_breakdown TEXT;
BEGIN
  net_discount_only :=
    COALESCE(NEW.subtotal, 0)
    - COALESCE(NEW.discount_amount, 0);

  net_all_discounts :=
    net_discount_only
    - COALESCE(NEW.promotion_discount_amount, 0)
    - COALESCE(NEW.membership_discount_amount, 0)
    - COALESCE(NEW.loyalty_discount_amount, 0);

  excl_discount_only :=
    net_discount_only
    + COALESCE(NEW.tax_amount, 0)
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  incl_discount_only :=
    net_discount_only
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  excl_all_discounts :=
    net_all_discounts
    + COALESCE(NEW.tax_amount, 0)
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  incl_all_discounts :=
    net_all_discounts
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  IF ABS(NEW.total_amount - excl_discount_only) <= 0.01
     OR ABS(NEW.total_amount - incl_discount_only) <= 0.01
     OR ABS(NEW.total_amount - excl_all_discounts) <= 0.01
     OR ABS(NEW.total_amount - incl_all_discounts) <= 0.01 THEN
    RETURN NEW;
  END IF;

  component_breakdown := format(
    'Subtotal: %s, Discount: %s, Promo: %s, Membership: %s, Loyalty: %s, Tax: %s, Service Fee: %s, Travel: %s, Tip: %s, Cancellation Fee: %s — accepted totals [excl/incl discount-only: %s / %s, excl/incl all-discounts: %s / %s], but total_amount is %s',
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
    excl_discount_only,
    incl_discount_only,
    excl_all_discounts,
    incl_all_discounts,
    NEW.total_amount
  );

  RAISE EXCEPTION 'Total amount validation failed. %', component_breakdown
    USING ERRCODE = '23514',
          HINT = 'total_amount must match subtotal minus discounts (optionally including promotion/membership/loyalty) plus tax/fees/travel/tip minus cancellation, in tax-exclusive or VAT-inclusive style.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_booking_total IS
  'Ensures total_amount matches discount-only OR all-discounts (promo/membership/loyalty) pricing, in tax-exclusive or VAT-inclusive style.';
