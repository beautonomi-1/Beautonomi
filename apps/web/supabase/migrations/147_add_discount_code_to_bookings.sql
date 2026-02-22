-- Beautonomi Database Migration
-- 147_add_discount_code_to_bookings.sql
-- Adds discount_code column to bookings table for complete booking financial context
-- Also ensures all financial fields are properly documented

-- Add discount_code column to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS discount_code TEXT;

-- Add cancellation_fee column (if applicable when booking is cancelled)
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10, 2) DEFAULT 0 CHECK (cancellation_fee >= 0);

-- Add index for discount_code lookups (useful for analytics and reporting)
CREATE INDEX IF NOT EXISTS idx_bookings_discount_code ON bookings(discount_code) WHERE discount_code IS NOT NULL;

-- Add comments to document all financial fields
COMMENT ON COLUMN bookings.discount_code IS 'Discount/promo code applied to this booking (e.g., "SUMMER2024", "FIRST10")';
COMMENT ON COLUMN bookings.discount_amount IS 'Amount discounted from subtotal';
COMMENT ON COLUMN bookings.discount_reason IS 'Reason for discount (e.g., "Loyalty discount", "Promotional offer")';
COMMENT ON COLUMN bookings.tax_rate IS 'Tax rate percentage applied (e.g., 15 for 15%)';
COMMENT ON COLUMN bookings.tax_amount IS 'Calculated tax amount based on taxable items';
COMMENT ON COLUMN bookings.service_fee_percentage IS 'Service fee percentage applied at time of booking (e.g., 10.0 for 10%)';
COMMENT ON COLUMN bookings.service_fee_amount IS 'Calculated service fee amount (e.g., R5.68)';
COMMENT ON COLUMN bookings.service_fee_paid_by IS 'Who pays the service fee: customer or provider';
COMMENT ON COLUMN bookings.tip_amount IS 'Tip amount added to booking (e.g., R4.49)';
COMMENT ON COLUMN bookings.travel_fee IS 'Travel/transportation fee for at-home services (0 for at_salon bookings)';
COMMENT ON COLUMN bookings.cancellation_fee IS 'Fee charged when booking is cancelled (if applicable based on cancellation policy)';
COMMENT ON COLUMN bookings.subtotal IS 'Subtotal before taxes, fees, tips, and discounts';
COMMENT ON COLUMN bookings.total_amount IS 'Final total amount including all fees, taxes, tips, travel fees, and discounts';
COMMENT ON COLUMN bookings.total_paid IS 'Total amount paid for this booking (from booking_payments table)';
COMMENT ON COLUMN bookings.total_refunded IS 'Total amount refunded for this booking (from booking_refunds table)';

-- Note: Addons are stored in booking_addons table
-- Note: Variants are stored in booking_services table with the variant's offering_id
-- Note: Services are stored in booking_services table with the service's offering_id
