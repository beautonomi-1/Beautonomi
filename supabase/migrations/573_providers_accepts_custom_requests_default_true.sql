-- Default custom service requests to ON; backfill existing rows that were never opted in.
-- Previously DEFAULT false + onboarding `|| false` left most providers blocked for customers.

ALTER TABLE public.providers
  ALTER COLUMN accepts_custom_requests SET DEFAULT true;

UPDATE public.providers
SET accepts_custom_requests = true
WHERE accepts_custom_requests IS DISTINCT FROM true;

COMMENT ON COLUMN public.providers.accepts_custom_requests IS 'When true, customers may submit custom service requests to this provider. Default true.';
