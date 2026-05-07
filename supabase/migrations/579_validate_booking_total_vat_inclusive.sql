-- Align validate_booking_total with provider/API VAT-inclusive pricing:
-- `tax_amount` often stores the VAT *portion embedded in* (subtotal - discount),
-- while `total_amount` is still computed as inclusive gross + fees (tax not added again).
-- The original formula treated tax_amount as additive on top of net subtotal, which
-- rejected valid VAT-inclusive rows (incl. group participant bookings from the provider app).

CREATE OR REPLACE FUNCTION validate_booking_total()
RETURNS TRIGGER AS $$
DECLARE
  net_after_discount NUMERIC(18, 4);
  exclusive_style_total NUMERIC(18, 4);
  inclusive_style_total NUMERIC(18, 4);
  component_breakdown TEXT;
BEGIN
  net_after_discount :=
    COALESCE(NEW.subtotal, 0)
    - COALESCE(NEW.discount_amount, 0);

  exclusive_style_total :=
    net_after_discount
    + COALESCE(NEW.tax_amount, 0)
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  inclusive_style_total :=
    net_after_discount
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);

  IF ABS(NEW.total_amount - exclusive_style_total) <= 0.01
     OR ABS(NEW.total_amount - inclusive_style_total) <= 0.01 THEN
    RETURN NEW;
  END IF;

  component_breakdown := format(
    'Subtotal: %s, Discount: %s, Tax: %s, Service Fee: %s, Travel: %s, Tip: %s, Cancellation Fee: %s — exclusive-style total %s, inclusive-style total %s, but total_amount is %s',
    COALESCE(NEW.subtotal, 0),
    COALESCE(NEW.discount_amount, 0),
    COALESCE(NEW.tax_amount, 0),
    COALESCE(NEW.service_fee_amount, 0),
    COALESCE(NEW.travel_fee, 0),
    COALESCE(NEW.tip_amount, 0),
    COALESCE(NEW.cancellation_fee, 0),
    exclusive_style_total,
    inclusive_style_total,
    NEW.total_amount
  );

  RAISE EXCEPTION 'Total amount validation failed. %', component_breakdown
    USING ERRCODE = '23514',
          HINT = 'total_amount must match either tax-exclusive sum (subtotal - discount + tax + fees + travel + tip - cancellation) or VAT-inclusive sum (subtotal - discount + fees + travel + tip - cancellation) when tax is embedded in subtotal.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_booking_total IS
  'Ensures total_amount matches exclusive-style pricing OR VAT-inclusive pricing where tax_amount is a breakdown only.';

-- Legacy providers may still have NULL tenant_id; bookings.tenant_id is NOT NULL.
CREATE OR REPLACE FUNCTION public.bookings_set_tenant_id_from_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.provider_id IS NOT NULL THEN
    SELECT p.tenant_id INTO NEW.tenant_id FROM public.providers p WHERE p.id = NEW.provider_id;
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := public.tenant_default_za_id();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
