-- Customer + cron fields for recurring_appointments (aligned with API usage).

ALTER TABLE public.recurring_appointments
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS frequency TEXT,
    ADD COLUMN IF NOT EXISTS preferred_time TEXT,
    ADD COLUMN IF NOT EXISTS last_booking_date DATE,
    ADD COLUMN IF NOT EXISTS location_type TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT;

COMMENT ON COLUMN public.recurring_appointments.metadata IS 'Extra payload from customer recurring flow: services[], address, etc.';
COMMENT ON COLUMN public.recurring_appointments.frequency IS 'Optional: weekly | biweekly | monthly when using simple customer schedule (cron fallback).';
COMMENT ON COLUMN public.recurring_appointments.preferred_time IS 'HH:MM from customer flow; complements start_time.';
COMMENT ON COLUMN public.recurring_appointments.last_booking_date IS 'Calendar date of last auto-generated occurrence (cron).';
COMMENT ON COLUMN public.recurring_appointments.location_type IS 'at_salon | at_home for generated bookings.';
COMMENT ON COLUMN public.recurring_appointments.payment_method IS 'card | cash preference (does not auto-charge).';

CREATE INDEX IF NOT EXISTS idx_recurring_appointments_last_booking
    ON public.recurring_appointments (provider_id, last_booking_date)
    WHERE is_active = true;
