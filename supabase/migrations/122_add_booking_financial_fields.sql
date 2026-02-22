-- Beautonomi Database Migration
-- 122_add_booking_financial_fields.sql
-- Adds missing financial fields to bookings table for comprehensive invoicing

-- Add tax fields to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
ADD COLUMN IF NOT EXISTS travel_fee NUMERIC(10, 2) DEFAULT 0 CHECK (travel_fee >= 0),
ADD COLUMN IF NOT EXISTS discount_reason TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS ref_number TEXT;

-- Add index for ref_number lookups
CREATE INDEX IF NOT EXISTS idx_bookings_ref_number ON bookings(ref_number);

-- Update existing bookings to have ref_number if missing (use booking_number as fallback)
UPDATE bookings 
SET ref_number = booking_number 
WHERE ref_number IS NULL OR ref_number = '';

-- Add comments to new columns
COMMENT ON COLUMN bookings.tax_rate IS 'Tax rate percentage (e.g., 15 for 15%)';
COMMENT ON COLUMN bookings.tax_amount IS 'Calculated tax amount based on taxable items';
COMMENT ON COLUMN bookings.travel_fee IS 'Travel/transportation fee for at-home services';
COMMENT ON COLUMN bookings.discount_reason IS 'Reason for discount applied to booking';
COMMENT ON COLUMN bookings.notes IS 'Additional notes or special instructions for the booking';
COMMENT ON COLUMN bookings.ref_number IS 'Human-readable reference number for invoices and communication';
