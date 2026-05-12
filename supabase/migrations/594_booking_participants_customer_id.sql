-- 594_booking_participants_customer_id.sql
--
-- §Group-booking-audit 2026-05: when a provider selects an existing client
-- via the client-search flow (web dialog or mobile create sheet), the picked
-- customer should be linked to the booking_participants row so that:
--   1. The group receipt can display the customer's profile data.
--   2. Future workflows (convert inline participant → real booking) can use
--      the customer_id without another lookup.
--   3. Reporting queries can join booking_participants → users for per-customer
--      group revenue analytics.
--
-- The column is nullable — participants added without a client search (walk-in
-- style) simply have NULL.

ALTER TABLE public.booking_participants
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.booking_participants.customer_id IS
  'Linked customer (auth.users.id) when an existing client was selected via '
  'the provider client-search during group booking creation. NULL for walk-in / anonymous participants.';

-- Partial index for history/analytics joins: only index rows that have a customer link.
CREATE INDEX IF NOT EXISTS idx_booking_participants_customer_id
  ON public.booking_participants (customer_id)
  WHERE customer_id IS NOT NULL;
