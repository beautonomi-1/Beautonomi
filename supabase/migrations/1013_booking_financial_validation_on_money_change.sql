-- 1013: Run booking financial validations only when money columns change.
-- Status-only cancels (provider cancel with fee 0) must not fail on legacy fee rows.

DROP TRIGGER IF EXISTS validate_service_fee_calculation_trigger ON public.bookings;
CREATE TRIGGER validate_service_fee_calculation_trigger
  BEFORE INSERT OR UPDATE OF subtotal, service_fee_amount, service_fee_percentage ON public.bookings
  FOR EACH ROW
  WHEN (
    NEW.service_fee_percentage IS NOT NULL
    AND NEW.service_fee_percentage > 0
    AND NEW.subtotal IS NOT NULL
    AND NEW.subtotal > 0
    AND NEW.service_fee_amount IS NOT NULL
  )
  EXECUTE FUNCTION validate_service_fee_calculation();

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
    total_amount
  ON public.bookings
  FOR EACH ROW
  WHEN (
    NEW.subtotal IS NOT NULL
    AND NEW.total_amount IS NOT NULL
  )
  EXECUTE FUNCTION validate_booking_total();
