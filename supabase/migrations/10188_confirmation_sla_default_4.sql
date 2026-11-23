-- Default online confirmation window is 4 business hours.
-- Providers still on the previous default of 2 move to 4.
-- A provider who saved any other value keeps it.

ALTER TABLE public.providers
  ALTER COLUMN confirmation_sla_hours SET DEFAULT 4;

UPDATE public.providers
SET confirmation_sla_hours = 4
WHERE confirmation_sla_hours = 2;

COMMENT ON COLUMN public.providers.confirmation_sla_hours IS
  'Business-hours SLA for confirming customer online booking requests. Default 4.';
