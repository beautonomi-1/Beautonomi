-- Must run in its own migration (committed) before 381_booking_payments_tenant_id.sql.
-- PostgreSQL 55P04: new enum values cannot be used in the same transaction as ALTER TYPE ADD VALUE.

-- bookings.payment_status is enum payment_status (001). Migration 126 intended TEXT with partially_paid
-- but ADD COLUMN IF NOT EXISTS skipped when the column already existed. update_booking_payment_status()
-- (126/140) sets partially_paid — add the label before any booking_payments UPDATE fires that trigger.
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partially_paid';
