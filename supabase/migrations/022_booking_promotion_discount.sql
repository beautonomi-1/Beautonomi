-- Beautonomi Database Migration
-- 022_booking_promotion_discount.sql
-- Store promo-code discount amount separately from other discounts (packages, etc.)

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS promotion_discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (promotion_discount_amount >= 0);

