-- Link appointment-attached retail products to the product order fulfillment queue.
-- Booking products remain the canonical revenue/payment lines; product_orders rows
-- created from bookings are operational fulfillment records so providers can pick,
-- prepare, and mark the in-store pickup as collected.

ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.product_orders
  DROP CONSTRAINT IF EXISTS product_orders_order_source_check;

ALTER TABLE public.product_orders
  ADD CONSTRAINT product_orders_order_source_check
  CHECK (order_source IN ('online', 'walk_in', 'appointment'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_orders_booking_unique
  ON public.product_orders(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_orders_provider_booking
  ON public.product_orders(provider_id, booking_id)
  WHERE booking_id IS NOT NULL;

COMMENT ON COLUMN public.product_orders.booking_id IS
  'Appointment booking that owns these retail fulfillment lines. Revenue/payment remain on bookings/booking_products to avoid double counting.';

COMMENT ON COLUMN public.product_orders.order_source IS
  'online = customer placed via shop, walk_in = provider retail sale, appointment = retail attached to a booking for pickup/fulfillment tracking.';
