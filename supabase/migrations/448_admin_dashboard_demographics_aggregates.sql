-- Demographics for superadmin marketing dashboard (tenant scope).
-- Customers: age from users.date_of_birth; decade from user_profiles.decade_born (social profile).
-- Providers (business): providers.years_in_business only (not duplicated on users).
-- Provider people: users.date_of_birth for owners + staff linked to providers in tenant.

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
      AND u.preferred_home_tenant_id = p_tenant_id
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
  'Admin: customer age brackets from users.date_of_birth (role=customer, preferred_home_tenant_id).';

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
    AND u.preferred_home_tenant_id = p_tenant_id
  GROUP BY COALESCE(NULLIF(TRIM(up.decade_born), ''), 'Unknown')
  ORDER BY user_count DESC;
$$;

COMMENT ON FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(uuid) IS
  'Admin: decade_born from user_profiles for customers in tenant (coarser than DOB).';

CREATE OR REPLACE FUNCTION public.admin_dashboard_provider_years_in_business_by_tenant(p_tenant_id uuid)
RETURNS TABLE (bracket text, provider_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (
    SELECT
      CASE
        WHEN p.years_in_business IS NULL THEN 'Unknown'
        WHEN p.years_in_business <= 0 THEN '0 (new or unspecified)'
        WHEN p.years_in_business <= 2 THEN '1–2'
        WHEN p.years_in_business <= 5 THEN '3–5'
        WHEN p.years_in_business <= 10 THEN '6–10'
        ELSE '11+'
      END AS bracket
    FROM public.providers p
    WHERE p.tenant_id = p_tenant_id
  )
  SELECT b.bracket::text, COUNT(*)::bigint AS provider_count
  FROM b
  GROUP BY b.bracket
  ORDER BY
    CASE b.bracket
      WHEN 'Unknown' THEN 0
      WHEN '0 (new or unspecified)' THEN 1
      WHEN '1–2' THEN 2
      WHEN '3–5' THEN 3
      WHEN '6–10' THEN 4
      WHEN '11+' THEN 5
      ELSE 99
    END;
$$;

COMMENT ON FUNCTION public.admin_dashboard_provider_years_in_business_by_tenant(uuid) IS
  'Admin: business tenure from providers.years_in_business (not users).';

CREATE OR REPLACE FUNCTION public.admin_dashboard_provider_person_age_brackets_by_tenant(p_tenant_id uuid)
RETURNS TABLE (bracket text, user_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tenant_provider_users AS (
    SELECT DISTINCT pr.user_id AS uid
    FROM public.providers pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.user_id IS NOT NULL
    UNION
    SELECT DISTINCT ps.user_id AS uid
    FROM public.provider_staff ps
    INNER JOIN public.providers pr ON pr.id = ps.provider_id
    WHERE pr.tenant_id = p_tenant_id
      AND ps.user_id IS NOT NULL
      AND COALESCE(ps.is_active, true) = true
  ),
  ages AS (
    SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.date_of_birth))::integer AS age_years
    FROM tenant_provider_users t
    INNER JOIN public.users u ON u.id = t.uid
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN a.age_years IS NULL THEN 'Unknown'
        WHEN a.age_years < 18 THEN 'Under 18'
        WHEN a.age_years < 25 THEN '18–24'
        WHEN a.age_years < 35 THEN '25–34'
        WHEN a.age_years < 45 THEN '35–44'
        WHEN a.age_years < 55 THEN '45–54'
        WHEN a.age_years < 65 THEN '55–64'
        ELSE '65+'
      END AS bracket
    FROM ages a
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

COMMENT ON FUNCTION public.admin_dashboard_provider_person_age_brackets_by_tenant(uuid) IS
  'Admin: age from users.date_of_birth for provider owners and staff (tenant-scoped).';

REVOKE ALL ON FUNCTION public.admin_dashboard_customer_age_brackets_by_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dashboard_provider_years_in_business_by_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_dashboard_provider_person_age_brackets_by_tenant(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_customer_age_brackets_by_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_customer_decade_born_by_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_provider_years_in_business_by_tenant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_provider_person_age_brackets_by_tenant(uuid) TO service_role;
