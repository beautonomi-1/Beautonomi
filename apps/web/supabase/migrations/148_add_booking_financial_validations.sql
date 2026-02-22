-- Beautonomi Database Migration
-- 148_add_booking_financial_validations.sql
-- Adds validation triggers to ensure financial data integrity

-- ============================================================================
-- 1. Total Amount Validation
-- ============================================================================
-- Validates that total_amount matches the sum of all components
CREATE OR REPLACE FUNCTION validate_booking_total()
RETURNS TRIGGER AS $$
DECLARE
  calculated_total NUMERIC(10, 2);
  component_breakdown TEXT;
BEGIN
  -- Calculate expected total from components
  -- Note: subtotal should include services, addons, and products
  calculated_total := 
    COALESCE(NEW.subtotal, 0)
    - COALESCE(NEW.discount_amount, 0)
    + COALESCE(NEW.tax_amount, 0)
    + COALESCE(NEW.service_fee_amount, 0)
    + COALESCE(NEW.travel_fee, 0)
    + COALESCE(NEW.tip_amount, 0)
    - COALESCE(NEW.cancellation_fee, 0);
  
  -- Allow small rounding differences (0.01) for floating point precision
  IF ABS(NEW.total_amount - calculated_total) > 0.01 THEN
    component_breakdown := format(
      'Subtotal: %s (should include services + addons + products), Discount: %s, Tax: %s, Service Fee: %s, Travel: %s, Tip: %s, Cancellation Fee: %s = %s, but total_amount is %s',
      COALESCE(NEW.subtotal, 0),
      COALESCE(NEW.discount_amount, 0),
      COALESCE(NEW.tax_amount, 0),
      COALESCE(NEW.service_fee_amount, 0),
      COALESCE(NEW.travel_fee, 0),
      COALESCE(NEW.tip_amount, 0),
      COALESCE(NEW.cancellation_fee, 0),
      calculated_total,
      NEW.total_amount
    );
    
    RAISE EXCEPTION 'Total amount validation failed. %', component_breakdown
      USING ERRCODE = '23514', -- check_violation
            HINT = 'Ensure total_amount = subtotal (services+addons+products) - discount_amount + tax_amount + service_fee_amount + travel_fee + tip_amount - cancellation_fee';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for total amount validation
DROP TRIGGER IF EXISTS validate_booking_total_trigger ON bookings;
CREATE TRIGGER validate_booking_total_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  WHEN (
    NEW.subtotal IS NOT NULL 
    AND NEW.total_amount IS NOT NULL
  )
  EXECUTE FUNCTION validate_booking_total();

-- ============================================================================
-- 2. Service Fee Calculation Validation
-- ============================================================================
-- Validates that service_fee_amount matches subtotal * service_fee_percentage / 100
CREATE OR REPLACE FUNCTION validate_service_fee_calculation()
RETURNS TRIGGER AS $$
DECLARE
  calculated_fee NUMERIC(10, 2);
BEGIN
  -- Only validate if both percentage and amount are provided
  IF NEW.service_fee_percentage IS NOT NULL 
     AND NEW.service_fee_percentage > 0 
     AND NEW.subtotal IS NOT NULL 
     AND NEW.subtotal > 0 
     AND NEW.service_fee_amount IS NOT NULL THEN
    
    -- Calculate expected service fee
    calculated_fee := ROUND((NEW.subtotal * NEW.service_fee_percentage / 100)::NUMERIC, 2);
    
    -- Allow small rounding differences (0.01) for floating point precision
    IF ABS(NEW.service_fee_amount - calculated_fee) > 0.01 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514', -- check_violation
        MESSAGE = format('Service fee calculation validation failed. Expected: %s (subtotal %s * percentage %s / 100), but service_fee_amount is %s', 
                        calculated_fee, NEW.subtotal, NEW.service_fee_percentage, NEW.service_fee_amount),
        HINT = format('Ensure service_fee_amount = subtotal * service_fee_percentage / 100. Expected: %s', calculated_fee);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for service fee validation
DROP TRIGGER IF EXISTS validate_service_fee_calculation_trigger ON bookings;
CREATE TRIGGER validate_service_fee_calculation_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  WHEN (
    NEW.service_fee_percentage IS NOT NULL 
    AND NEW.service_fee_percentage > 0
    AND NEW.subtotal IS NOT NULL
    AND NEW.subtotal > 0
    AND NEW.service_fee_amount IS NOT NULL
  )
  EXECUTE FUNCTION validate_service_fee_calculation();

-- ============================================================================
-- 3. Refund Amount Validation
-- ============================================================================
-- Validates that refund amount doesn't exceed the payment amount
CREATE OR REPLACE FUNCTION validate_refund_amount()
RETURNS TRIGGER AS $$
DECLARE
  payment_amount NUMERIC(10, 2);
  total_refunded_for_payment NUMERIC(10, 2);
  booking_total_paid NUMERIC(10, 2);
  booking_total_refunded NUMERIC(10, 2);
  new_total_refunded NUMERIC(10, 2);
BEGIN
  -- If refund is linked to a specific payment, validate against that payment
  IF NEW.payment_id IS NOT NULL THEN
    SELECT amount INTO payment_amount
    FROM booking_payments
    WHERE id = NEW.payment_id;
    
    IF payment_amount IS NULL THEN
      RAISE EXCEPTION 'Payment with id % does not exist', NEW.payment_id;
    END IF;
    
    -- Calculate total refunded for this payment (including this refund)
    SELECT COALESCE(SUM(amount), 0) INTO total_refunded_for_payment
    FROM booking_refunds
    WHERE payment_id = NEW.payment_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND status = 'completed';
    
    -- Check if refund exceeds payment amount
    IF (total_refunded_for_payment + NEW.amount) > payment_amount THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514', -- check_violation
        MESSAGE = format('Refund amount validation failed. Total refunded for payment (%s + %s) = %s exceeds payment amount (%s)', 
                        total_refunded_for_payment, NEW.amount, (total_refunded_for_payment + NEW.amount), payment_amount),
        HINT = format('Total refunds for this payment cannot exceed %s. Current refunds: %s, New refund: %s', 
                     payment_amount, total_refunded_for_payment, NEW.amount);
    END IF;
  END IF;
  
  -- Also validate against total paid for the booking
  SELECT total_paid, total_refunded INTO booking_total_paid, booking_total_refunded
  FROM bookings
  WHERE id = NEW.booking_id;
  
  IF booking_total_paid IS NOT NULL THEN
    -- Get current total refunded (excluding this refund if updating)
    SELECT COALESCE(SUM(amount), 0) INTO new_total_refunded
    FROM booking_refunds
    WHERE booking_id = NEW.booking_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
      AND status = 'completed';
    
    new_total_refunded := new_total_refunded + NEW.amount;
    
    -- Allow refunds to slightly exceed total_paid (for cancellation fees, etc.)
    -- But warn if it's significantly more
    IF new_total_refunded > booking_total_paid * 1.1 THEN
      RAISE WARNING 'Total refunded (%) exceeds total paid (%) by more than 10%%. This may indicate an error.', 
        new_total_refunded, booking_total_paid;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for refund amount validation
DROP TRIGGER IF EXISTS validate_refund_amount_trigger ON booking_refunds;
CREATE TRIGGER validate_refund_amount_trigger
  BEFORE INSERT OR UPDATE ON booking_refunds
  FOR EACH ROW
  WHEN (NEW.status = 'completed' OR NEW.status = 'pending')
  EXECUTE FUNCTION validate_refund_amount();

-- ============================================================================
-- 4. Tax Amount Validation (Bonus)
-- ============================================================================
-- Validates that tax_amount matches taxable base * tax_rate / 100
CREATE OR REPLACE FUNCTION validate_tax_calculation()
RETURNS TRIGGER AS $$
DECLARE
  calculated_tax NUMERIC(10, 2);
  taxable_base NUMERIC(10, 2);
BEGIN
  -- Only validate if both rate and amount are provided
  IF NEW.tax_rate IS NOT NULL 
     AND NEW.tax_rate > 0 
     AND NEW.tax_amount IS NOT NULL THEN
    
    -- Calculate taxable base (subtotal - discount + service fee + travel fee)
    -- Note: Tax calculation may vary by jurisdiction, this is a general approach
    taxable_base := 
      COALESCE(NEW.subtotal, 0)
      - COALESCE(NEW.discount_amount, 0)
      + COALESCE(NEW.service_fee_amount, 0)
      + COALESCE(NEW.travel_fee, 0);
    
    -- Calculate expected tax
    calculated_tax := ROUND((taxable_base * NEW.tax_rate / 100)::NUMERIC, 2);
    
    -- Allow small rounding differences (0.01) for floating point precision
    IF ABS(NEW.tax_amount - calculated_tax) > 0.01 THEN
      RAISE WARNING 'Tax calculation validation warning. Expected: % (taxable base % * rate % / 100), but tax_amount is %. This may be intentional based on tax rules.'
        USING calculated_tax,
              taxable_base,
              NEW.tax_rate,
              NEW.tax_amount;
      -- Note: Using WARNING instead of EXCEPTION because tax calculations can vary
      -- by jurisdiction and may have special rules (e.g., some items tax-exempt)
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tax validation (warning only, not blocking)
DROP TRIGGER IF EXISTS validate_tax_calculation_trigger ON bookings;
CREATE TRIGGER validate_tax_calculation_trigger
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  WHEN (
    NEW.tax_rate IS NOT NULL 
    AND NEW.tax_rate > 0
    AND NEW.tax_amount IS NOT NULL
  )
  EXECUTE FUNCTION validate_tax_calculation();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION validate_booking_total IS 'Validates that total_amount matches the sum of all financial components';
COMMENT ON FUNCTION validate_service_fee_calculation IS 'Validates that service_fee_amount matches subtotal * service_fee_percentage / 100';
COMMENT ON FUNCTION validate_refund_amount IS 'Validates that refund amounts do not exceed payment amounts';
COMMENT ON FUNCTION validate_tax_calculation IS 'Validates tax calculation (warning only, as tax rules may vary by jurisdiction)';
