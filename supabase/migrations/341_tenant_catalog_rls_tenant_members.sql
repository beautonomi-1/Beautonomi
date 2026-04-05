-- Allow authenticated users with an active user_tenant_roles row to read their tenant catalog (spec §7–8).
-- Existing superadmin-only policies on these tables remain; multiple SELECT policies combine with OR.

DROP POLICY IF EXISTS "Tenant role holders select tenants" ON public.tenants;
CREATE POLICY "Tenant role holders select tenants"
  ON public.tenants FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = tenants.id
        AND utr.is_active = true
    )
  );

DROP POLICY IF EXISTS "Tenant role holders select tenant_domains" ON public.tenant_domains;
CREATE POLICY "Tenant role holders select tenant_domains"
  ON public.tenant_domains FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = tenant_domains.tenant_id
        AND utr.is_active = true
    )
  );

DROP POLICY IF EXISTS "Tenant role holders select tenant_settings" ON public.tenant_settings;
CREATE POLICY "Tenant role holders select tenant_settings"
  ON public.tenant_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = tenant_settings.tenant_id
        AND utr.is_active = true
    )
  );
