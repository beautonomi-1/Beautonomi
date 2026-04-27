-- Security Advisor hardening, round 2.
--
-- This migration intentionally uses guarded, idempotent changes. The goal is to
-- remove broad/default exposure without changing app-facing behavior that relies
-- on public booking, public media URLs, provider feature checks, or admin/service
-- role maintenance jobs.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Fix "Function Search Path Mutable" for application-owned public functions.
-- Extension-owned functions are excluded because Supabase/Postgres may manage
-- those definitions directly.
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
        'ALTER FUNCTION %s SET search_path = public, extensions, pg_temp',
        fn.ident
      );
    EXCEPTION
      WHEN insufficient_privilege OR undefined_function THEN
        RAISE NOTICE 'Skipping search_path hardening for %: %', fn.ident, SQLERRM;
    END;
  END LOOP;
END $$;

-- Move relocatable extensions out of public when the database supports it.
-- PostGIS is repeated here as best-effort because some Supabase/PostGIS builds
-- do not support SET SCHEMA; in that case the prior accepted exception remains.
DO $$
DECLARE
  ext record;
BEGIN
  FOR ext IN
    SELECT e.extname, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('btree_gist', 'pg_trgm', 'postgis')
  LOOP
    IF ext.schema_name = 'public' THEN
      BEGIN
        EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext.extname);
      EXCEPTION
        WHEN feature_not_supported OR insufficient_privilege OR object_not_in_prerequisite_state THEN
          RAISE NOTICE 'Leaving extension % in public: %', ext.extname, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- Materialized views are refreshed and read by trusted server/admin paths only.
-- Removing anon/authenticated SELECT keeps them out of the Data API surface.
REVOKE SELECT ON TABLE public.admin_finance_daily FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.provider_dashboard_daily FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.admin_bookings_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_finance_daily TO service_role;
GRANT SELECT ON TABLE public.provider_dashboard_daily TO service_role;
GRANT SELECT ON TABLE public.admin_bookings_daily TO service_role;

-- Replace always-true RLS write policies with role- or shape-constrained checks.
-- Public insert flows remain public, but the predicates are no longer no-ops.

DROP POLICY IF EXISTS "Allow insert ai_usage_log" ON public.ai_usage_log;
CREATE POLICY "Allow service role insert ai_usage_log"
  ON public.ai_usage_log
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can insert error logs" ON public.error_logs;
CREATE POLICY "Service role can insert error logs"
  ON public.error_logs
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can insert health checks" ON public.api_health_checks;
CREATE POLICY "Service role can insert health checks"
  ON public.api_health_checks
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "System can insert audit log entries" ON public.booking_audit_log;
CREATE POLICY "System can insert audit log entries"
  ON public.booking_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on financial_period_locks" ON public.financial_period_locks;
CREATE POLICY "Service role full access on financial_period_locks"
  ON public.financial_period_locks
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service can insert Yoco refunds" ON public.provider_yoco_refunds;
CREATE POLICY "Service can insert Yoco refunds"
  ON public.provider_yoco_refunds
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow webhook ingest" ON public.provider_yoco_webhook_events;
CREATE POLICY "Allow webhook ingest"
  ON public.provider_yoco_webhook_events
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "booking_holds_insert_public" ON public.booking_holds;
CREATE POLICY "booking_holds_insert_public"
  ON public.booking_holds
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    provider_id IS NOT NULL
    AND booking_services_snapshot IS NOT NULL
    AND start_at < end_at
    AND expires_at > now()
    AND hold_status = 'active'
  );

DROP POLICY IF EXISTS "Public can join city waitlist" ON public.city_waitlist;
CREATE POLICY "Public can join city waitlist"
  ON public.city_waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(trim(city_name)) > 0
    AND length(trim(name)) > 0
    AND (
      (email IS NOT NULL AND position('@' in email) > 1)
      OR (phone IS NOT NULL AND length(trim(phone)) >= 7)
    )
    AND status = 'pending'
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can insert learning article feedback" ON public.learning_article_feedback;
CREATE POLICY "Anyone can insert learning article feedback"
  ON public.learning_article_feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    article_id IS NOT NULL
    AND (user_id IS NULL OR user_id = auth.uid())
    AND (session_id IS NULL OR length(trim(session_id)) BETWEEN 8 AND 200)
  );

DROP POLICY IF EXISTS "Allow anon insert for maintenance notify" ON public.maintenance_notify_emails;
CREATE POLICY "Allow anon insert for maintenance notify"
  ON public.maintenance_notify_emails
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    position('@' in email) > 1
    AND scope IN ('public_site', 'provider_web', 'customer_app', 'provider_app')
  );

DROP POLICY IF EXISTS "user_referrals_insert" ON public.user_referrals;
CREATE POLICY "user_referrals_insert"
  ON public.user_referrals
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role'
    OR referrer_id = auth.uid()
    OR referred_user_id = auth.uid()
  );

-- Public buckets do not need broad SELECT policies for public object URLs.
-- Dropping these policies prevents clients from listing every object while
-- keeping direct public URL access intact for the buckets themselves.
DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read explore posts media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read explore posts media" ON storage.objects;
DROP POLICY IF EXISTS "Public read message attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read provider gallery images" ON storage.objects;

-- Remove implicit execution for SECURITY DEFINER functions exposed through
-- public. We grant back only the app-facing RPCs that are intentionally called
-- by anonymous or authenticated sessions.
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

-- PostGIS helper functions surfaced by the linter are not app RPCs.
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

-- Anonymous flows: zone checks, booking portal tokens, and gift-card redemption
-- are reachable from public booking/customer paths.
DO $$
DECLARE
  rpc_name text;
  fn record;
BEGIN
  FOREACH rpc_name IN ARRAY ARRAY[
    'check_point_in_platform_zones',
    'is_superadmin',
    'reserve_gift_card_redemption',
    'validate_portal_token',
    'use_portal_token'
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

-- Authenticated app RPCs used by provider/customer server routes. These remain
-- callable so existing web/app behavior is preserved after removing PUBLIC.
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
    'can_provider_add_location',
    'can_provider_add_staff',
    'can_provider_create_booking',
    'can_provider_send_message',
    'capture_gift_card_redemption',
    'can_access_provider',
    'check_resource_availability',
    'create_booking_with_locking',
    'create_user_bypass_trigger',
    'decrement_product_stock',
    'decrement_product_variant_stock',
    'generate_group_booking_ref',
    'get_active_clients',
    'get_clients_by_first_booking_date',
    'get_clients_by_visit_count',
    'get_customer_available_points',
    'get_inactive_clients',
    'get_or_create_route',
    'get_user_provider_id',
    'get_provider_subscription_plan',
    'get_provider_subscription_status',
    'get_provider_subscription_tier',
    'get_provider_usage_summary',
    'get_user_loyalty_balance',
    'has_permission',
    'increment_product_stock',
    'increment_product_variant_stock',
    'initialize_provider_points_for_all',
    'is_provider_owner',
    'is_provider_staff',
    'is_superadmin',
    'lock_booking_resources_for_update',
    'lock_booking_services_for_update',
    'nextval',
    'provider_has_feature_access',
    'recalculate_provider_gamification',
    'seed_provider_automation_templates',
    'st_asgeojson_zone_exclusions_union_simplified',
    'st_asgeojson_zone_inclusions_union_simplified',
    'st_asgeojson_zone_simplified',
    'st_zone_geometry_fragment_count',
    'void_gift_card_redemption',
    'wallet_credit_admin'
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
