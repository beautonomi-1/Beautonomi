-- Tenant-scoped brand desk purge helper (called from compliance reset route).

CREATE OR REPLACE FUNCTION public.brand_reset_tenant_data(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.brand_metric_entries WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_placements WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_activity WHERE tenant_id = p_tenant_id;
  UPDATE public.brand_briefs SET accepted_campaign_id = NULL WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_campaigns WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_briefs WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_period_snapshots WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_settings WHERE tenant_id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_reset_tenant_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_reset_tenant_data(uuid) TO service_role;
