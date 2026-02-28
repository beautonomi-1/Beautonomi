-- Migration 275: Add waiting room support to bookings (checked_in_time, status values)
-- Enables provider waiting room / front desk: count and list appointments that are
-- checked in but not yet started. API uses status IN ('waiting','checked_in','confirmed')
-- and checked_in_time IS NOT NULL.

-- Add enum values for waiting room flow (PostgreSQL 10+ IF NOT EXISTS)
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'waiting';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'checked_in';

-- Add checked_in_time for waiting room (when client checked in at salon)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_time TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN bookings.checked_in_time IS 'When the client checked in at the salon (waiting room). Used with status waiting/checked_in for front desk.';

CREATE INDEX IF NOT EXISTS idx_bookings_checked_in_time ON bookings(provider_id, checked_in_time) WHERE checked_in_time IS NOT NULL;
