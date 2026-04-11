-- Add deposit-related columns to bookings table.
-- These allow both provider-created and customer-created bookings to track
-- whether a deposit was required, how much, and whether it was collected.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_option TEXT DEFAULT 'full'
    CHECK (payment_option IN ('full', 'deposit'));
