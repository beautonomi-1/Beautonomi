-- 844: Restore anon EXECUTE on RLS helper RPCs dropped by 842.
--
-- 842 re-ran the 547 bulk revoke (`REVOKE ALL ON FUNCTION ... FROM PUBLIC,
-- anon, authenticated` for every SECURITY DEFINER function in public) but its
-- grant-back lists only re-added `check_point_in_platform_zones` for anon.
-- 547 had also granted `is_superadmin` and `reserve_gift_card_redemption` to
-- anon, so those two lost anon EXECUTE.
--
-- `is_superadmin()` is referenced by the superadmin RLS policies on `users`,
-- and permissive policies are OR-ed and all evaluated, so *any* anon SELECT on
-- a table whose policy set reaches `users` failed with
-- "permission denied for function is_superadmin" (42501). That took out the
-- whole logged-out surface: global_service_categories, subcategories,
-- providers, offerings, provider_categories, master_services, explore_posts,
-- page_content, learning_articles, platform_zones, tenant_domains, ...
--
-- These helpers are SECURITY DEFINER and derive everything from auth.uid(),
-- which is NULL for anon, so they return false/NULL for anonymous sessions.
-- Granting EXECUTE back to anon leaks nothing; it only lets the RLS policy
-- expression be evaluated.
--
-- Portal token RPCs (`validate_portal_token`, `use_portal_token`) are
-- deliberately left service_role-only per 843 — the Next.js portal routes call
-- them with the admin client.

DO $$
DECLARE
  rpc_name text;
  fn       record;
BEGIN
  FOREACH rpc_name IN ARRAY ARRAY[
    -- Referenced by the superadmin RLS policies on public.users (049).
    'is_superadmin',
    -- Guest checkout: /api/public/bookings applies gift cards with the
    -- caller's (anonymous) client.
    'reserve_gift_card_redemption'
  ]
  LOOP
    FOR fn IN
      SELECT p.oid::regprocedure AS ident
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = rpc_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', fn.ident);
    END LOOP;
  END LOOP;
END $$;

-- Verification: anon must be able to read active global categories again.
DO $$
DECLARE
  v_has_execute boolean;
BEGIN
  SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
  INTO v_has_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'is_superadmin';

  IF v_has_execute IS NOT TRUE THEN
    RAISE EXCEPTION 'anon still lacks EXECUTE on public.is_superadmin; public site reads will keep failing with 42501';
  END IF;

  RAISE NOTICE 'anon EXECUTE on is_superadmin restored.';
END $$;
