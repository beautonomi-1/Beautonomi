-- Re-apply compliance_reset_tenant_transactions for databases that already ran migration 601
-- before `booking_holds` was removed from the tenant_id phase. `booking_holds` has no tenant_id
-- (216_booking_holds.sql); phase 1 was failing first on that table with:
--   ERROR: column "tenant_id" does not exist
--
-- Idempotent: definition matches 601_compliance_reset_tenant_notifications_fix.sql after the holds fix.

CREATE OR REPLACE FUNCTION public.compliance_reset_tenant_transactions(
  p_tenant_id               UUID,
  p_dry_run                 BOOLEAN DEFAULT TRUE,
  p_allow_default_tenant    BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_slug  TEXT;
  v_default_id   UUID;
  v_counts       JSONB := '{}'::jsonb;
  v_count        BIGINT;
  v_sql          TEXT;
  v_started_at   TIMESTAMPTZ := NOW();

  v_tenant_tables TEXT[] := ARRAY[
    'booking_payments',
    'finance_transactions',
    'wallet_transactions',
    'wallet_topups',
    'gift_card_orders',
    'gift_cards',
    'membership_orders',
    'provider_subscriptions',
    'product_orders',
    'bookings',
    'user_reports',
    'user_verifications'
  ];

  v_join_delete   JSONB := '[
    {"t": "booking_holds",          "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "booking_services",       "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)"},
    {"t": "booking_audit_log",      "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)"},
    {"t": "booking_refunds",        "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)"},
    {"t": "additional_charges",     "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)"},
    {"t": "reviews",                "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "provider_client_ratings","where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "sales",                  "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "product_order_items",    "where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)"},
    {"t": "product_return_requests","where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)"},
    {"t": "conversations",          "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "messages",               "where": "conversation_id IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))"},
    {"t": "support_tickets",        "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "on_demand_requests",   "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"},
    {"t": "custom_requests",      "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)"}
  ]'::jsonb;

  v_entry JSONB;
  v_t     TEXT;
  v_where TEXT;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  SELECT slug INTO v_tenant_slug FROM public.tenants WHERE id = p_tenant_id;
  IF v_tenant_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant % not found', p_tenant_id;
  END IF;

  BEGIN
    v_default_id := public.tenant_default_za_id();
  EXCEPTION WHEN undefined_function THEN
    v_default_id := NULL;
  END;

  IF p_tenant_id = v_default_id AND p_allow_default_tenant IS NOT TRUE THEN
    RAISE EXCEPTION 'Refusing to reset the default ZA tenant without p_allow_default_tenant := true';
  END IF;

  -- notifications: no tenant_id column — scope via users tied to tenant (while bookings still exist).
  IF to_regclass('public.notifications') IS NULL THEN
    v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('skipped', 'table_missing'));
  ELSIF p_dry_run THEN
    EXECUTE $q$
      SELECT COUNT(*)::bigint FROM public.notifications n
      WHERE n.user_id IN (
        SELECT DISTINCT b.customer_id
        FROM public.bookings b
        WHERE b.tenant_id = $1 AND b.customer_id IS NOT NULL
        UNION
        SELECT p.user_id
        FROM public.providers p
        WHERE p.tenant_id = $1 AND p.user_id IS NOT NULL
        UNION
        SELECT ps.user_id
        FROM public.provider_staff ps
        WHERE ps.provider_id IN (SELECT id FROM public.providers pr WHERE pr.tenant_id = $1)
          AND ps.user_id IS NOT NULL
        UNION
        SELECT po.customer_id
        FROM public.product_orders po
        WHERE po.tenant_id = $1 AND po.customer_id IS NOT NULL
      )
    $q$ INTO v_count USING p_tenant_id;
    v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('rows', v_count, 'via', 'tenant_scoped_users'));
  ELSE
    EXECUTE $q$
      WITH d AS (
        DELETE FROM public.notifications n
        WHERE n.user_id IN (
          SELECT DISTINCT b.customer_id
          FROM public.bookings b
          WHERE b.tenant_id = $1 AND b.customer_id IS NOT NULL
          UNION
          SELECT p.user_id
          FROM public.providers p
          WHERE p.tenant_id = $1 AND p.user_id IS NOT NULL
          UNION
          SELECT ps.user_id
          FROM public.provider_staff ps
          WHERE ps.provider_id IN (SELECT id FROM public.providers pr WHERE pr.tenant_id = $1)
            AND ps.user_id IS NOT NULL
          UNION
          SELECT po.customer_id
          FROM public.product_orders po
          WHERE po.tenant_id = $1 AND po.customer_id IS NOT NULL
        )
        RETURNING 1
      )
      SELECT COUNT(*)::bigint FROM d
    $q$ INTO v_count USING p_tenant_id;
    v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('rows', v_count, 'via', 'tenant_scoped_users'));
  END IF;

  FOREACH v_t IN ARRAY v_tenant_tables LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('skipped', 'table_missing'));
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_sql := format('SELECT COUNT(*) FROM public.%I WHERE tenant_id = $1', v_t);
      EXECUTE v_sql INTO v_count USING p_tenant_id;
    ELSE
      v_sql := format('WITH d AS (DELETE FROM public.%I WHERE tenant_id = $1 RETURNING 1) SELECT COUNT(*) FROM d', v_t);
      EXECUTE v_sql INTO v_count USING p_tenant_id;
    END IF;

    v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('rows', v_count, 'via', 'tenant_id'));
  END LOOP;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_join_delete) LOOP
    v_t     := v_entry->>'t';
    v_where := v_entry->>'where';

    IF to_regclass('public.' || v_t) IS NULL THEN
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('skipped', 'table_missing'));
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_sql := format('SELECT COUNT(*) FROM public.%I WHERE %s', v_t, v_where);
      EXECUTE v_sql INTO v_count USING p_tenant_id;
    ELSE
      v_sql := format('WITH d AS (DELETE FROM public.%I WHERE %s RETURNING 1) SELECT COUNT(*) FROM d', v_t, v_where);
      EXECUTE v_sql INTO v_count USING p_tenant_id;
    END IF;

    v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('rows', v_count, 'via', 'join'));
  END LOOP;

  RETURN jsonb_build_object(
    'tenant_id',    p_tenant_id,
    'tenant_slug',  v_tenant_slug,
    'dry_run',      p_dry_run,
    'started_at',   v_started_at,
    'completed_at', NOW(),
    'counts',       v_counts
  );
END;
$$;

COMMENT ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) IS
  'Superadmin clean-slate: wipe tenant transactional data while preserving users, providers, services, catalog, and tenant config. Dry-run by default. Call via /api/admin/compliance/reset-tenant.';

REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) TO service_role;
