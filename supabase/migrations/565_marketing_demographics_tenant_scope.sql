-- Align marketing / demographics aggregates with user_matches_admin_tenant_scope (migration 561).

CREATE OR REPLACE FUNCTION public.admin_dashboard_signup_sources_by_tenant(p_tenant_id uuid)
RETURNS TABLE (signup_source text, user_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.signup_source, '')::text AS signup_source, COUNT(*)::bigint AS user_count
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
  GROUP BY u.signup_source
  ORDER BY user_count DESC;
$$;

COMMENT ON FUNCTION public.admin_dashboard_signup_sources_by_tenant(uuid) IS
  'Admin marketing: count users per signup_source for admin tenant scope (all roles; same as user directory).';

REVOKE ALL ON FUNCTION public.admin_dashboard_signup_sources_by_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_signup_sources_by_tenant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_dashboard_customer_age_brackets_by_tenant(p_tenant_id uuid)
RETURNS TABLE (bracket text, user_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cust AS (
    SELECT u.id,
           EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.date_of_birth))::integer AS age_years
    FROM public.users u
    WHERE u.role = 'customer'
      AND public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN c.age_years IS NULL THEN 'Unknown'
        WHEN c.age_years < 18 THEN 'Under 18'
        WHEN c.age_years < 25 THEN '18–24'
        WHEN c.age_years < 35 THEN '25–34'
        WHEN c.age_years < 45 THEN '35–44'
        WHEN c.age_years < 55 THEN '45–54'
        WHEN c.age_years < 65 THEN '55–64'
        ELSE '65+'
      END AS bracket
    FROM cust c
  )
  SELECT b.bracket::text, COUNT(*)::bigint AS user_count
  FROM bucketed b
  GROUP BY b.bracket
  ORDER BY
    CASE b.bracket
      WHEN 'Unknown' THEN 0
      WHEN 'Under 18' THEN 1
      WHEN '18–24' THEN 2
      WHEN '25–34' THEN 3
      WHEN '35–44' THEN 4
      WHEN '45–54' THEN 5
      WHEN '55–64' THEN 6
      WHEN '65+' THEN 7
      ELSE 99
    END;
$$;

COMMENT ON FUNCTION public.admin_dashboard_customer_age_brackets_by_tenant(uuid) IS
  'Admin: customer age brackets (role=customer in admin tenant scope).';

REVOKE ALL ON FUNCTION public.admin_dashboard_customer_age_brackets_by_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_customer_age_brackets_by_tenant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(p_tenant_id uuid)
RETURNS TABLE (decade_label text, user_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(up.decade_born), ''), 'Unknown')::text AS decade_label,
    COUNT(*)::bigint AS user_count
  FROM public.users u
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  WHERE u.role = 'customer'
    AND public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
  GROUP BY COALESCE(NULLIF(TRIM(up.decade_born), ''), 'Unknown')
  ORDER BY user_count DESC;
$$;

COMMENT ON FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(uuid) IS
  'Admin: decade_born from user_profiles for customers in admin tenant scope.';

REVOKE ALL ON FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(uuid) TO service_role;
