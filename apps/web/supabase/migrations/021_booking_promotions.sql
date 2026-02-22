-- Beautonomi Database Migration
-- 021_booking_promotions.sql
-- Link bookings to promotions for coupon usage tracking

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_promotion_id ON bookings(promotion_id) WHERE promotion_id IS NOT NULL;

