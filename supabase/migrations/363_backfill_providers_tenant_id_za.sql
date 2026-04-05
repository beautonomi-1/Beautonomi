-- Backfill providers (and related wave-1 tables) that still have NULL tenant_id
-- after 332_tenant_id_wave1_nullable.sql, e.g. partial deploys or manual inserts.
-- Default market tenant is slug = 'za'. Adjust the slug in a fork if your default tenant differs.

UPDATE public.providers p
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'za' LIMIT 1)
WHERE p.tenant_id IS NULL;

UPDATE public.bookings b
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'za' LIMIT 1)
WHERE b.tenant_id IS NULL;
