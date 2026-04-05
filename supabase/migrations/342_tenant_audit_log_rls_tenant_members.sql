-- Tenant-scoped admins can read audit rows for tenants they belong to (spec control-plane visibility).
-- Superadmin SELECT policy from 336 remains; multiple SELECT policies combine with OR.

DROP POLICY IF EXISTS "Tenant role holders select tenant_audit_log" ON public.tenant_audit_log;
CREATE POLICY "Tenant role holders select tenant_audit_log"
  ON public.tenant_audit_log FOR SELECT
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = tenant_audit_log.tenant_id
        AND utr.is_active = true
    )
  );
