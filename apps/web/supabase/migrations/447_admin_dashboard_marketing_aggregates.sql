-- Aggregates for superadmin marketing / growth dashboard (tenant scope).

CREATE OR REPLACE FUNCTION public.admin_dashboard_signup_sources_by_tenant(p_tenant_id uuid)
RETURNS TABLE (signup_source text, user_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.signup_source, '')::text AS signup_source, COUNT(*)::bigint AS user_count
  FROM public.users u
  WHERE u.preferred_home_tenant_id = p_tenant_id
  GROUP BY u.signup_source
  ORDER BY user_count DESC;
$$;

COMMENT ON FUNCTION public.admin_dashboard_signup_sources_by_tenant(uuid) IS
  'Admin marketing: count users per signup_source for preferred_home_tenant_id = tenant (includes all roles).';

CREATE OR REPLACE FUNCTION public.admin_dashboard_previous_software_by_tenant(p_tenant_id uuid)
RETURNS TABLE (previous_software text, provider_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.previous_software, '')::text AS previous_software, COUNT(*)::bigint AS provider_count
  FROM public.providers p
  WHERE p.tenant_id = p_tenant_id
  GROUP BY p.previous_software
  ORDER BY provider_count DESC;
$$;

COMMENT ON FUNCTION public.admin_dashboard_previous_software_by_tenant(uuid) IS
  'Admin marketing: count providers per previous_software (onboarding “prior booking system”).';

REVOKE ALL ON FUNCTION public.admin_dashboard_signup_sources_by_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dashboard_previous_software_by_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_signup_sources_by_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_previous_software_by_tenant(uuid) TO service_role;
