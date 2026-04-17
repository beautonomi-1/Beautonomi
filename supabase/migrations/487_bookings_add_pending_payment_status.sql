-- F3: Align booking_status enum with application code.
--
-- `apps/web/src/app/api/public/bookings/route.ts` and several webhook handlers
-- write / filter on `pending_payment`, but the enum shipped in 080_reference_data
-- did not include that value. This causes silent status drift and query filters
-- that never match.
--
-- NOTE: In PostgreSQL, a newly-added enum value cannot be used in the same
-- transaction. This migration MUST be applied in its own transaction (no mixing
-- with later usage in the same migration file).

ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'pending_payment';
