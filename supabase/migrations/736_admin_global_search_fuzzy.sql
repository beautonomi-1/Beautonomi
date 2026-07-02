-- Migration 736: Fuzzy global admin search RPC + trigram indexes
--
-- The admin top-bar search (GET /api/admin/search) previously ran several plain
-- `ILIKE '%term%'` substring queries against users, bookings and providers. That
-- had no typo tolerance ("beauatonomi" matched nothing), no relevance ranking,
-- and required multiple round trips per keystroke.
--
-- This migration introduces a single SECURITY DEFINER RPC that searches all three
-- entities in one call using pg_trgm similarity (fuzzy, typo tolerant) combined
-- with substring ILIKE, tenant-scoped via the existing
-- user_matches_admin_tenant_scope() helper, and ranked by best similarity.
--
-- pg_trgm is already enabled in migration 001. GIN trigram indexes are added so
-- both the `%`/similarity operators and the `ILIKE '%term%'` predicates stay fast.
--
-- Migration 547 relocates pg_trgm from `public` to the `extensions` schema on
-- databases that support it, so both the index operator class (`gin_trgm_ops`)
-- and the `similarity()` function may live in `extensions`. We therefore put
-- `public, extensions` on the search path for the index DDL below, and pin the
-- RPC's search_path to `public, extensions, pg_temp` (matching the 547 hardening
-- convention) so it resolves regardless of which schema owns pg_trgm.
SET search_path = public, extensions;

-- Trigram indexes powering fuzzy + substring matching.
CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm
  ON public.users USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON public.users USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_phone_trgm
  ON public.users USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_providers_business_name_trgm
  ON public.providers USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number_trgm
  ON public.bookings USING gin (booking_number gin_trgm_ops);

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
  -- Clamp so a stray large p_limit can't turn the search box into a bulk export.
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 5), 25));
  -- Minimum trigram similarity for a fuzzy (non-substring) match. 0.3 tolerates
  -- small typos while keeping unrelated rows out.
  v_threshold real := 0.3;
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

  -- USERS: match name / email / phone by substring or trigram similarity.
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
        OR similarity(COALESCE(u.full_name, ''), v_q) >= v_threshold
        OR similarity(COALESCE(u.email, ''), v_q) >= v_threshold
      )
    ORDER BY rank DESC, u.created_at DESC NULLS LAST
    LIMIT v_limit
  ) t;

  -- PROVIDERS: match business name / phone, plus the owning user's name / email.
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
        OR COALESCE(ou.full_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(ou.email, '') ILIKE '%' || v_q || '%'
        OR similarity(COALESCE(p.business_name, ''), v_q) >= v_threshold
        OR similarity(COALESCE(ou.full_name, ''), v_q) >= v_threshold
      )
    ORDER BY rank DESC, p.created_at DESC NULLS LAST
    LIMIT v_limit
  ) t;

  -- BOOKINGS: match booking number, plus the customer's name / email / phone.
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

COMMENT ON FUNCTION public.admin_global_search(uuid, text, int) IS
  'Tenant-scoped fuzzy global search across users, providers and bookings for the admin top-bar search box. Combines pg_trgm similarity with substring ILIKE and ranks by best similarity.';

-- This SECURITY DEFINER RPC bypasses RLS and accepts an arbitrary p_tenant_id, so
-- it must never be callable by anon/authenticated PostgREST clients (that would be
-- a cross-tenant data leak). Migration 547's revoke loop already ran, so the
-- default PUBLIC EXECUTE grant on this new function must be stripped explicitly.
-- Only server routes using the service_role key may invoke it.
REVOKE ALL ON FUNCTION public.admin_global_search(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_search(uuid, text, int) TO service_role;
