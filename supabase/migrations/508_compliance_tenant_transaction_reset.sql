-- Superadmin "clean slate" tool: wipe a tenant's transactional data (bookings, orders, payments,
-- ledger, notifications, conversations, etc.) while preserving structural data (users, providers,
-- services, products, platform settings, tenant config).
--
-- Guard rails:
--   * SECURITY DEFINER + service_role-only grant (superadmin gate enforced in the Next.js API layer).
--   * Tenant must exist.
--   * Default ZA tenant (legacy) is blocked unless `p_allow_default_tenant := true` is passed — prevents
--     accidental production wipes when the wrong UUID is pasted.
--   * Dry-run returns per-table row counts without deleting so the UI can show a preview report.
--   * When not dry-run, rows are deleted in FK-safe order and the resulting per-table counts are returned.
--
-- Companion audit trail is the existing `compliance_purge_audit_log` table (migration 441); the API
-- inserts a row with `purge_type='tenant_reset'`, so migration 509 widens the CHECK constraint.

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

  -- Tables scoped by a direct `tenant_id` column. Ordered children → parents so FK cascades
  -- don't surprise the caller (most of these have ON DELETE CASCADE children that auto-cleanup).
  v_tenant_tables TEXT[] := ARRAY[
    'booking_holds',
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

  -- Tables that reference a booking / provider / order indirectly and don't have tenant_id.
  -- They're removed via joins against the tenant-scoped parent. Each entry is `{target_table, join_sql}`.
  -- The deletion runs AFTER the tenant_tables loop because many of these are descendants that already
  -- cascaded. Treat returned counts as upper bounds (cascade may have got there first).
  v_join_delete   JSONB := '[
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
    {"t": "notifications",          "where": "tenant_id = $1 OR user_id IN (SELECT user_id FROM public.provider_staff WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))"}
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

  -- Block the legacy ZA default tenant unless explicitly acknowledged (it's the production tenant
  -- for every South African provider; wiping it accidentally would take the whole platform offline).
  BEGIN
    v_default_id := public.tenant_default_za_id();
  EXCEPTION WHEN undefined_function THEN
    v_default_id := NULL;
  END;

  IF p_tenant_id = v_default_id AND p_allow_default_tenant IS NOT TRUE THEN
    RAISE EXCEPTION 'Refusing to reset the default ZA tenant without p_allow_default_tenant := true';
  END IF;

  -- Phase 1: tables with direct tenant_id column
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

  -- Phase 2: descendant tables that don't carry tenant_id directly.
  -- Many of these are already gone after Phase 1 cascades — the counts reported here are post-cascade.
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


-- Widen the purge-audit CHECK so tenant_reset rows are accepted.
-- Existing rows (user / provider_org) stay valid.
DO $$
DECLARE
  v_con_name TEXT;
BEGIN
  SELECT conname INTO v_con_name
  FROM pg_constraint
  WHERE conrelid = 'public.compliance_purge_audit_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%purge_type%';

  IF v_con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.compliance_purge_audit_log DROP CONSTRAINT %I', v_con_name);
  END IF;
END $$;

ALTER TABLE public.compliance_purge_audit_log
  ADD CONSTRAINT compliance_purge_audit_log_purge_type_check
  CHECK (purge_type IN ('user', 'provider_org', 'tenant_reset'));
