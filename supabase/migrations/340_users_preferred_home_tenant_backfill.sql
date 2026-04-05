-- Default preferred home tenant for legacy users (spec §6.2.1). Enables tenant-scoped wallet metrics where we join on this column.
UPDATE public.users u
SET preferred_home_tenant_id = t.id
FROM public.tenants t
WHERE u.preferred_home_tenant_id IS NULL
  AND t.slug = 'za';
