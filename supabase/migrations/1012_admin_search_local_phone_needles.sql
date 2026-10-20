-- Local-number phone search for admin user list + global search (082… vs +27…).

SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.phone_search_needles_unscoped(p_query text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_query, ''), '\D', '', 'g');
  v_tail text;
  v_out text[] := ARRAY[]::text[];
BEGIN
  IF length(v_digits) < 4 THEN
    RETURN v_out;
  END IF;
  v_out := array_append(v_out, v_digits);
  IF left(v_digits, 1) = '0' THEN
    v_tail := regexp_replace(v_digits, '^0+', '');
    IF length(v_tail) >= 4 AND NOT (v_tail = ANY (v_out)) THEN
      v_out := array_append(v_out, v_tail);
    END IF;
  END IF;
  IF length(v_digits) >= 9 AND NOT (right(v_digits, 9) = ANY (v_out)) THEN
    v_out := array_append(v_out, right(v_digits, 9));
  END IF;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.phone_search_needles_unscoped(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phone_search_needles_unscoped(text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_users_list_for_tenant(
  p_tenant_id uuid,
  p_limit int,
  p_offset int,
  p_search text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_signup_source text DEFAULT NULL,
  p_is_shadow boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_data jsonb;
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_role text := NULLIF(trim(COALESCE(p_role, '')), '');
  v_signup text := NULLIF(trim(COALESCE(p_signup_source, '')), '');
  v_search_uuid uuid := NULL;
  v_phone_needles text[] := public.phone_search_needles_unscoped(NULLIF(trim(COALESCE(p_search, '')), ''));
BEGIN
  IF v_search IS NOT NULL AND v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    BEGIN
      v_search_uuid := v_search::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_search_uuid := NULL;
    END;
  END IF;

  SELECT COUNT(*)::bigint INTO v_total
  FROM public.users u
  WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
    AND (
      v_search IS NULL
      OR (v_search_uuid IS NOT NULL AND u.id = v_search_uuid)
      OR u.full_name ILIKE '%' || v_search || '%'
      OR u.email ILIKE '%' || v_search || '%'
      OR COALESCE(u.phone, '') ILIKE '%' || v_search || '%'
      OR EXISTS (
        SELECT 1 FROM unnest(v_phone_needles) AS n(needle)
        WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%' || n.needle || '%'
      )
    )
    AND (v_role IS NULL OR lower(v_role) = 'all' OR u.role::text = v_role)
    AND (
      v_signup IS NULL
      OR lower(v_signup) = 'all'
      OR COALESCE(u.signup_source::text, '') = v_signup
    )
    AND (p_is_shadow IS NULL OR COALESCE(u.is_shadow, false) = p_is_shadow);

  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_data
  FROM (
    SELECT u.*
    FROM public.users u
    WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
      AND (
        v_search IS NULL
        OR (v_search_uuid IS NOT NULL AND u.id = v_search_uuid)
        OR u.full_name ILIKE '%' || v_search || '%'
        OR u.email ILIKE '%' || v_search || '%'
        OR COALESCE(u.phone, '') ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(v_phone_needles) AS n(needle)
          WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%' || n.needle || '%'
        )
      )
      AND (v_role IS NULL OR lower(v_role) = 'all' OR u.role::text = v_role)
      AND (
        v_signup IS NULL
        OR lower(v_signup) = 'all'
        OR COALESCE(u.signup_source::text, '') = v_signup
      )
      AND (p_is_shadow IS NULL OR COALESCE(u.is_shadow, false) = p_is_shadow)
    ORDER BY u.created_at DESC NULLS LAST
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'data', v_data);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_users_list_for_tenant(uuid, int, int, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_users_list_for_tenant(uuid, int, int, text, text, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_global_search(
  p_tenant_id uuid,
  p_query text,
  p_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_q text := NULLIF(trim(COALESCE(p_query, '')), '');
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 5), 25));
  v_threshold real := 0.3;
  v_phone_needles text[] := public.phone_search_needles_unscoped(NULLIF(trim(COALESCE(p_query, '')), ''));
  v_users jsonb;
  v_providers jsonb;
  v_bookings jsonb;
BEGIN
  IF v_q IS NULL OR length(v_q) < 2 THEN
    RETURN jsonb_build_object(
      'users', '[]'::jsonb,
      'providers', '[]'::jsonb,
      'bookings', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(
    jsonb_agg((to_jsonb(t) - 'rank') ORDER BY t.rank DESC, t.created_at DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_users
  FROM (
    SELECT
      u.id,
      u.email,
      u.phone,
      u.full_name,
      u.role,
      u.created_at,
      GREATEST(
        similarity(COALESCE(u.full_name, ''), v_q),
        similarity(COALESCE(u.email, ''), v_q),
        similarity(COALESCE(u.phone, ''), v_q)
      ) AS rank
    FROM public.users u
    WHERE public.user_matches_admin_tenant_scope(u.id, p_tenant_id)
      AND (
        u.full_name ILIKE '%' || v_q || '%'
        OR u.email ILIKE '%' || v_q || '%'
        OR COALESCE(u.phone, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(v_phone_needles) AS n(needle)
          WHERE regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g') LIKE '%' || n.needle || '%'
        )
        OR similarity(COALESCE(u.full_name, ''), v_q) >= v_threshold
        OR similarity(COALESCE(u.email, ''), v_q) >= v_threshold
      )
    ORDER BY rank DESC, u.created_at DESC NULLS LAST
    LIMIT v_limit
  ) t;

  SELECT coalesce(
    jsonb_agg((to_jsonb(t) - 'rank') ORDER BY t.rank DESC, t.created_at DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_providers
  FROM (
    SELECT
      p.id,
      p.business_name,
      p.phone,
      p.status,
      ou.full_name AS owner_name,
      ou.email AS owner_email,
      p.created_at,
      GREATEST(
        similarity(COALESCE(p.business_name, ''), v_q),
        similarity(COALESCE(ou.full_name, ''), v_q),
        similarity(COALESCE(ou.email, ''), v_q)
      ) AS rank
    FROM public.providers p
    LEFT JOIN public.users ou ON ou.id = p.user_id
    WHERE p.tenant_id = p_tenant_id
      AND (
        p.business_name ILIKE '%' || v_q || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(v_phone_needles) AS n(needle)
          WHERE regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') LIKE '%' || n.needle || '%'
        )
        OR COALESCE(ou.full_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(ou.email, '') ILIKE '%' || v_q || '%'
        OR similarity(COALESCE(p.business_name, ''), v_q) >= v_threshold
        OR similarity(COALESCE(ou.full_name, ''), v_q) >= v_threshold
      )
    ORDER BY rank DESC, p.created_at DESC NULLS LAST
    LIMIT v_limit
  ) t;

  SELECT coalesce(
    jsonb_agg((to_jsonb(t) - 'rank') ORDER BY t.rank DESC, t.created_at DESC NULLS LAST),
    '[]'::jsonb
  )
  INTO v_bookings
  FROM (
    SELECT
      b.id,
      b.booking_number,
      b.customer_id,
      b.provider_id,
      b.status,
      b.created_at,
      cu.full_name AS customer_name,
      cu.email AS customer_email,
      pr.business_name AS provider_name,
      GREATEST(
        similarity(COALESCE(b.booking_number, ''), v_q),
        similarity(COALESCE(cu.full_name, ''), v_q),
        similarity(COALESCE(cu.email, ''), v_q)
      ) AS rank
    FROM public.bookings b
    LEFT JOIN public.users cu ON cu.id = b.customer_id
    LEFT JOIN public.providers pr ON pr.id = b.provider_id
    WHERE b.tenant_id = p_tenant_id
      AND (
        b.booking_number ILIKE '%' || v_q || '%'
        OR COALESCE(cu.full_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(cu.email, '') ILIKE '%' || v_q || '%'
        OR COALESCE(cu.phone, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(v_phone_needles) AS n(needle)
          WHERE regexp_replace(COALESCE(cu.phone, ''), '\D', '', 'g') LIKE '%' || n.needle || '%'
        )
        OR similarity(COALESCE(b.booking_number, ''), v_q) >= v_threshold
        OR similarity(COALESCE(cu.full_name, ''), v_q) >= v_threshold
      )
    ORDER BY rank DESC, b.created_at DESC NULLS LAST
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'users', COALESCE(v_users, '[]'::jsonb),
    'providers', COALESCE(v_providers, '[]'::jsonb),
    'bookings', COALESCE(v_bookings, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_global_search(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_search(uuid, text, int) TO service_role;
