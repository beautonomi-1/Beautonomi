-- 842: Security Advisor hardening round 3.
--
-- Re-applies the 547 pattern for functions created or re-granted since that
-- migration: pin search_path, strip implicit PUBLIC/anon/authenticated EXECUTE
-- from SECURITY DEFINER RPCs, then grant back only intentional app-facing RPCs.
-- Admin/cron/trigger helpers remain service_role-only.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS gis;
GRANT USAGE ON SCHEMA extensions, gis TO anon, authenticated, service_role;

-- ── 0011 function_search_path_mutable ────────────────────────────────────────
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = public, extensions, gis, pg_temp',
        fn.ident
      );
    EXCEPTION
      WHEN insufficient_privilege OR undefined_function THEN
        RAISE NOTICE 'Skipping search_path hardening for %: %', fn.ident, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── 0028/0029 SECURITY DEFINER execute surface ───────────────────────────────
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.ident);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.ident);
    EXCEPTION
      WHEN insufficient_privilege OR undefined_function THEN
        RAISE NOTICE 'Skipping EXECUTE hardening for %: %', fn.ident, SQLERRM;
    END;
  END LOOP;
END $$;

-- PostGIS helpers accidentally exposed in public when the extension lives there.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'st_estimatedextent'
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.ident);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.ident);
    EXCEPTION
      WHEN insufficient_privilege OR undefined_function THEN
        RAISE NOTICE 'Skipping PostGIS EXECUTE hardening for %: %', fn.ident, SQLERRM;
    END;
  END LOOP;
END $$;

-- Anonymous booking flows: zone checks (PostGIS wrapped in SECURITY DEFINER RPC).
-- Portal token RPCs are service_role-only (843); app uses admin client.
DO $$
DECLARE
  rpc_name text;
  fn record;
BEGIN
  FOREACH rpc_name IN ARRAY ARRAY[
    'check_point_in_platform_zones'
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

-- Authenticated app RPCs (provider/customer server routes with user JWT).
DO $$
DECLARE
  rpc_name text;
  fn record;
BEGIN
  FOREACH rpc_name IN ARRAY ARRAY[
    'acquire_booking_lock',
    'backfill_all_provider_point_transactions',
    'backfill_provider_point_transactions',
    'calculate_chained_travel_fee',
    'calculate_distance_km',
    'calculate_route_savings',
    'can_access_provider',
    'can_provider_add_location',
    'can_provider_add_staff',
    'can_provider_create_booking',
    'can_provider_send_message',
    'capture_gift_card_redemption',
    'check_resource_availability',
    'create_booking_with_locking',
    'decrement_product_stock',
    'decrement_product_variant_stock',
    'generate_group_booking_ref',
    'get_active_clients',
    'get_clients_by_first_booking_date',
    'get_clients_by_visit_count',
    'get_customer_available_points',
    'get_inactive_clients',
    'get_or_create_route',
    'get_provider_subscription_plan',
    'get_provider_subscription_status',
    'get_provider_subscription_tier',
    'get_provider_usage_summary',
    'get_user_loyalty_balance',
    'get_user_provider_id',
    'has_permission',
    'increment_product_stock',
    'increment_product_variant_stock',
    'initialize_provider_points_for_all',
    'is_provider_owner',
    'is_provider_staff',
    'is_superadmin',
    'lock_booking_resources_for_update',
    'lock_booking_services_for_update',
    'lookup_gift_card_by_code',
    'nextval',
    'provider_has_feature_access',
    'recalculate_provider_gamification',
    'reserve_gift_card_redemption',
    'seed_provider_automation_templates',
    'staff_has_manage_team',
    'st_asgeojson_zone_exclusions_union_simplified',
    'st_asgeojson_zone_inclusions_union_simplified',
    'st_asgeojson_zone_simplified',
    'st_zone_geometry_fragment_count',
    'support_agent_can_access_ticket',
    'user_can_access_message_attachment_object',
    'user_owns_message_attachment_upload',
    'void_gift_card_redemption',
    'wallet_debit_self'
  ]
  LOOP
    FOR fn IN
      SELECT p.oid::regprocedure AS ident
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = rpc_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.ident);
    END LOOP;
  END LOOP;
END $$;

-- Cron / finance helpers: service_role only (explicit after bulk revoke).
DO $$
DECLARE
  rpc_name text;
  fn record;
BEGIN
  FOREACH rpc_name IN ARRAY ARRAY[
    'gl_currency_drift_exceptions',
    'finance_audit_run',
    'provider_finance_summary'
  ]
  LOOP
    FOR fn IN
      SELECT p.oid::regprocedure AS ident
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = rpc_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.ident);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.ident);
    END LOOP;
  END LOOP;
END $$;
