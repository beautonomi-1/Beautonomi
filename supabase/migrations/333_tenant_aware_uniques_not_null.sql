-- Wave 2 (constraints): tenant-scoped uniques + NOT NULL (spec §6.3, §6.6). Booking tenant backfill from provider on write.

CREATE OR REPLACE FUNCTION public.tenant_default_za_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.tenants WHERE slug = 'za' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.bookings_set_tenant_id_from_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.provider_id IS NOT NULL THEN
    SELECT p.tenant_id INTO NEW.tenant_id FROM public.providers p WHERE p.id = NEW.provider_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_set_tenant_from_provider ON public.bookings;
CREATE TRIGGER bookings_set_tenant_from_provider
  BEFORE INSERT OR UPDATE OF provider_id, tenant_id ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.bookings_set_tenant_id_from_provider();

-- Provider slug: global unique -> per-tenant unique
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_slug_key;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- Booking number: global unique -> per-tenant unique
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_number_key;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_tenant_id_booking_number_key UNIQUE (tenant_id, booking_number);

ALTER TABLE public.providers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.providers
  ALTER COLUMN tenant_id SET DEFAULT (public.tenant_default_za_id());
