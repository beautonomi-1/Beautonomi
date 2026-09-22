-- Expansion waitlist: track visitor country, channel, and persona for admin marketing ops.

ALTER TABLE public.city_waitlist
  ADD COLUMN IF NOT EXISTS country_code char(2),
  ADD COLUMN IF NOT EXISTS country_name text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS persona text;

ALTER TABLE public.city_waitlist
  DROP CONSTRAINT IF EXISTS city_waitlist_source_check;

ALTER TABLE public.city_waitlist
  ADD CONSTRAINT city_waitlist_source_check
  CHECK (source IS NULL OR source IN ('web', 'customer_app', 'provider_app'));

ALTER TABLE public.city_waitlist
  DROP CONSTRAINT IF EXISTS city_waitlist_persona_check;

ALTER TABLE public.city_waitlist
  ADD CONSTRAINT city_waitlist_persona_check
  CHECK (persona IS NULL OR persona IN ('customer', 'provider'));

CREATE INDEX IF NOT EXISTS city_waitlist_status_created_at_idx
  ON public.city_waitlist (status, created_at DESC);

CREATE INDEX IF NOT EXISTS city_waitlist_country_code_idx
  ON public.city_waitlist (country_code)
  WHERE country_code IS NOT NULL;
