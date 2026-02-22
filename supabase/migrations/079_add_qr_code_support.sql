-- Beautonomi Database Migration
-- 079_add_qr_code_support.sql
-- Adds QR code support for booking verification as fallback when OTP is disabled

-- Add QR code fields to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS qr_code_data JSONB,
ADD COLUMN IF NOT EXISTS qr_code_verification_code TEXT,
ADD COLUMN IF NOT EXISTS qr_code_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qr_code_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS otp_enabled BOOLEAN DEFAULT true; -- Flag to enable/disable OTP

-- Add index for QR code verification
CREATE INDEX IF NOT EXISTS idx_bookings_qr_code_verification 
ON bookings(qr_code_verification_code) 
WHERE qr_code_verification_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN bookings.qr_code_data IS 'QR code data including booking_id, verification_code, expires_at, and type';
COMMENT ON COLUMN bookings.qr_code_verification_code IS '8-character alphanumeric verification code for QR code';
COMMENT ON COLUMN bookings.qr_code_expires_at IS 'Expiry timestamp for QR code (15 minutes)';
COMMENT ON COLUMN bookings.qr_code_verified IS 'Whether QR code has been verified by customer';
COMMENT ON COLUMN bookings.otp_enabled IS 'Whether OTP verification is enabled for this booking';
