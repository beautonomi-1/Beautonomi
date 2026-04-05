-- Backfill tenant membership for existing admin users (default ZA tenant) so Host-scoped RBAC works.

INSERT INTO public.user_tenant_roles (user_id, tenant_id, role, is_active)
SELECT u.id, t.id, 'tenant_superadmin', true
FROM public.users u
CROSS JOIN public.tenants t
WHERE u.role = 'superadmin' AND t.slug = 'za'
ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

INSERT INTO public.user_tenant_roles (user_id, tenant_id, role, is_active)
SELECT u.id, t.id, u.role::text, true
FROM public.users u
CROSS JOIN public.tenants t
WHERE u.role::text LIKE 'admin_%' AND t.slug = 'za'
ON CONFLICT (user_id, tenant_id, role) DO NOTHING;
