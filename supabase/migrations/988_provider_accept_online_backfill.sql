-- Preserve current behaviour: providers could take online payments before accept_online enforcement.
UPDATE public.providers
SET accept_online = true
WHERE accept_online IS NOT true OR accept_online IS NULL;

ALTER TABLE public.providers
  ALTER COLUMN accept_online SET DEFAULT true;

COMMENT ON COLUMN public.providers.accept_online IS
  'When false, customers cannot pay online for this provider (platform gates still apply).';
