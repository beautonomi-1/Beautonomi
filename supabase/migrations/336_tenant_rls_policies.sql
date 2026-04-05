-- RLS policies for tenant control-plane tables (authenticated + superadmin). Service role bypasses RLS for API routes.
-- tenant_secrets: intentionally no policy — only service-role server access (spec §10.6).

DROP POLICY IF EXISTS "Superadmins select tenants" ON public.tenants;
CREATE POLICY "Superadmins select tenants"
  ON public.tenants FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmins select tenant_domains" ON public.tenant_domains;
CREATE POLICY "Superadmins select tenant_domains"
  ON public.tenant_domains FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmins select tenant_settings" ON public.tenant_settings;
CREATE POLICY "Superadmins select tenant_settings"
  ON public.tenant_settings FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Users select own tenant roles" ON public.user_tenant_roles;
CREATE POLICY "Users select own tenant roles"
  ON public.user_tenant_roles FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Superadmins manage tenant roles" ON public.user_tenant_roles;
CREATE POLICY "Superadmins manage tenant roles"
  ON public.user_tenant_roles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

DROP POLICY IF EXISTS "Superadmins select tenant_audit_log" ON public.tenant_audit_log;
CREATE POLICY "Superadmins select tenant_audit_log"
  ON public.tenant_audit_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

-- Reference metadata: safe to read for authenticated apps (no secrets in table).
DROP POLICY IF EXISTS "Authenticated read integration_capabilities" ON public.integration_capabilities;
CREATE POLICY "Authenticated read integration_capabilities"
  ON public.integration_capabilities FOR SELECT
  TO authenticated
  USING (true);
