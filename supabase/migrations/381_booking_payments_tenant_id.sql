-- booking_payments: tenant_id for RLS scoping and money-table invariants (spec §1.3, §6.6).
-- Depends on bookings.tenant_id NOT NULL (333) and tenant_default_za_id() (333).
-- Enum `partially_paid` is added in **381_00_payment_status_enum_partially_paid.sql** (separate migration
-- so PG commits the new label before this file’s UPDATEs — avoids 55P04).

ALTER TABLE IF EXISTS public.booking_payments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id);

UPDATE public.booking_payments bp
SET tenant_id = b.tenant_id
FROM public.bookings b
WHERE bp.booking_id = b.id
  AND b.tenant_id IS NOT NULL
  AND bp.tenant_id IS NULL;

UPDATE public.booking_payments bp
SET tenant_id = public.tenant_default_za_id()
WHERE bp.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_payments_tenant_id_created_at
  ON public.booking_payments (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.booking_payments_set_tenant_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.booking_id IS NOT NULL THEN
      SELECT b.tenant_id INTO NEW.tenant_id FROM public.bookings b WHERE b.id = NEW.booking_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
    SELECT b.tenant_id INTO NEW.tenant_id FROM public.bookings b WHERE b.id = NEW.booking_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.tenant_default_za_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_payments_set_tenant_from_booking ON public.booking_payments;
CREATE TRIGGER booking_payments_set_tenant_from_booking
  BEFORE INSERT OR UPDATE OF booking_id, tenant_id ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.booking_payments_set_tenant_from_booking();

COMMENT ON COLUMN public.booking_payments.tenant_id IS 'Market scope; mirrors bookings.tenant_id for tenant-scoped RLS and reporting.';

ALTER TABLE public.booking_payments
  ALTER COLUMN tenant_id SET NOT NULL;
