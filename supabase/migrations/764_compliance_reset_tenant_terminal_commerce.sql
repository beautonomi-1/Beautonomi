-- ============================================================================
-- 764: Extend compliance_reset_tenant_transactions for terminal commerce
-- ============================================================================

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
  v_wallet_ids   UUID[] := ARRAY[]::uuid[];

  -- Ordered execution plan. Each entry: {t: table, where: predicate ($1 = tenant id), via: label}.
  -- Order is significant: children before parents, and booking-attributable rows whose FK is
  -- SET NULL / non-FK BEFORE the bookings delete (see header).
  v_plan JSONB := '[
    {"t": "booking_services",            "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking"},
    {"t": "booking_audit_log",           "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking"},
    {"t": "booking_refunds",             "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking"},
    {"t": "additional_charges",          "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking"},
    {"t": "loyalty_point_redemptions",   "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking"},
    {"t": "gift_card_redemptions",       "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking"},
    {"t": "loyalty_points_ledger",       "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "loyalty_point_transactions",  "where": "reference_type = ''booking'' AND reference_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "reviews",                     "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "product_order_items",         "where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)", "via": "order"},
    {"t": "product_return_requests",     "where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)", "via": "order"},
    {"t": "promotion_usage",             "where": "promotion_id IN (SELECT id FROM public.promotions WHERE tenant_id = $1)", "via": "promotion"},

    {"t": "terminal_campaign_recipients", "where": "campaign_id IN (SELECT id FROM public.terminal_campaigns WHERE tenant_id = $1)", "via": "terminal_campaign"},
    {"t": "terminal_campaigns",          "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "terminal_admin_notes",        "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "provider_terminal_payment_allocations", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_paystack_terminal_payments", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_paystack_virtual_terminal_setup_requests", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "terminal_assets",             "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "terminal_orders",             "where": "tenant_id = $1", "via": "tenant_id"},

    {"t": "booking_payments",            "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "finance_transactions",        "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "wallet_transactions",         "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "wallet_topups",               "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "gift_card_orders",            "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "gift_cards",                  "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "membership_orders",           "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "provider_subscriptions",      "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "product_orders",              "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "payment_webhook_events",      "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "journal_entries",             "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "bookings",                    "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "user_reports",                "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "user_verifications",          "where": "tenant_id = $1", "via": "tenant_id"},

    {"t": "booking_holds",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_client_ratings",     "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "sales",                       "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "messages",                    "where": "conversation_id IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))", "via": "conversation"},
    {"t": "conversations",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "support_tickets",             "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "on_demand_requests",          "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "custom_requests",             "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "group_bookings",              "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_point_transactions", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_milestones",         "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_points",             "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "explore_posts",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "waitlist_entries",            "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "ads_campaigns",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "payouts",                     "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_invoices",           "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "recurring_appointments",      "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "vat_remittance_reminders",    "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"}
  ]'::jsonb;

  v_entry JSONB;
  v_t     TEXT;
  v_where TEXT;
  v_via   TEXT;
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

  -- Snapshot wallets touched by this tenant BEFORE their transactions are deleted,
  -- so we can recompute their balances from surviving rows afterwards.
  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT COALESCE(array_agg(DISTINCT wallet_id), ARRAY[]::uuid[]) FROM public.wallet_transactions WHERE tenant_id = $1'
        INTO v_wallet_ids USING p_tenant_id;
    EXCEPTION WHEN OTHERS THEN
      v_wallet_ids := ARRAY[]::uuid[];
    END;
  END IF;

  -- notifications (no tenant_id column) — must run BEFORE bookings are deleted,
  -- since it scopes via bookings.customer_id. Isolated so a failure is non-fatal.
  IF to_regclass('public.notifications') IS NULL THEN
    v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('skipped', 'table_missing'));
  ELSE
    BEGIN
      IF p_dry_run THEN
        EXECUTE $q$
          SELECT COUNT(*)::bigint FROM public.notifications n
          WHERE n.user_id IN (
            SELECT DISTINCT b.customer_id FROM public.bookings b WHERE b.tenant_id = $1 AND b.customer_id IS NOT NULL
            UNION SELECT p.user_id FROM public.providers p WHERE p.tenant_id = $1 AND p.user_id IS NOT NULL
            UNION SELECT ps.user_id FROM public.provider_staff ps WHERE ps.provider_id IN (SELECT id FROM public.providers pr WHERE pr.tenant_id = $1) AND ps.user_id IS NOT NULL
            UNION SELECT po.customer_id FROM public.product_orders po WHERE po.tenant_id = $1 AND po.customer_id IS NOT NULL
          )
        $q$ INTO v_count USING p_tenant_id;
      ELSE
        EXECUTE $q$
          WITH d AS (
            DELETE FROM public.notifications n
            WHERE n.user_id IN (
              SELECT DISTINCT b.customer_id FROM public.bookings b WHERE b.tenant_id = $1 AND b.customer_id IS NOT NULL
              UNION SELECT p.user_id FROM public.providers p WHERE p.tenant_id = $1 AND p.user_id IS NOT NULL
              UNION SELECT ps.user_id FROM public.provider_staff ps WHERE ps.provider_id IN (SELECT id FROM public.providers pr WHERE pr.tenant_id = $1) AND ps.user_id IS NOT NULL
              UNION SELECT po.customer_id FROM public.product_orders po WHERE po.tenant_id = $1 AND po.customer_id IS NOT NULL
            )
            RETURNING 1
          )
          SELECT COUNT(*)::bigint FROM d
        $q$ INTO v_count USING p_tenant_id;
      END IF;
      v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('rows', v_count, 'via', 'tenant_scoped_users'));
    EXCEPTION WHEN OTHERS THEN
      v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('skipped', 'error', 'error', SQLERRM));
    END;
  END IF;

  -- Main plan: each table isolated so a missing table/column or a RESTRICT FK
  -- is reported and skipped rather than aborting the whole reset.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    v_t     := v_entry->>'t';
    v_where := v_entry->>'where';
    v_via   := COALESCE(v_entry->>'via', 'scoped');

    IF to_regclass('public.' || v_t) IS NULL THEN
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('skipped', 'table_missing'));
      CONTINUE;
    END IF;

    BEGIN
      IF p_dry_run THEN
        v_sql := format('SELECT COUNT(*) FROM public.%I WHERE %s', v_t, v_where);
        EXECUTE v_sql INTO v_count USING p_tenant_id;
      ELSE
        v_sql := format('WITH d AS (DELETE FROM public.%I WHERE %s RETURNING 1) SELECT COUNT(*) FROM d', v_t, v_where);
        EXECUTE v_sql INTO v_count USING p_tenant_id;
      END IF;
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('rows', v_count, 'via', v_via));
    EXCEPTION WHEN OTHERS THEN
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('skipped', 'error', 'error', SQLERRM));
    END;
  END LOOP;

  -- ── RECOMPUTE: provider cached aggregates, derived from SURVIVING rows.
  --    (After a full wipe these net to 0 / NULL; recomputing from survivors keeps
  --    them correct even if a delete above was skipped, and is multi-tenant safe.)
  IF p_dry_run THEN
    BEGIN
      EXECUTE 'SELECT COUNT(*) FROM public.providers WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_counts := v_counts || jsonb_build_object('_provider_aggregates_recomputed',
        jsonb_build_object('providers_affected', v_count, 'via', 'recompute_preview'));
    EXCEPTION WHEN OTHERS THEN
      v_counts := v_counts || jsonb_build_object('_provider_aggregates_recomputed',
        jsonb_build_object('skipped', 'error', 'error', SQLERRM));
    END;
  ELSE
    BEGIN
      EXECUTE $q$
        UPDATE public.providers p
        SET review_count   = COALESCE((SELECT COUNT(*) FROM public.reviews r WHERE r.provider_id = p.id), 0),
            rating_average = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM public.reviews r WHERE r.provider_id = p.id), 0),
            total_bookings = COALESCE((SELECT COUNT(*) FROM public.bookings b WHERE b.provider_id = p.id), 0),
            total_paid_out = COALESCE((SELECT SUM(po.net_amount) FROM public.payouts po WHERE po.provider_id = p.id AND po.status = 'completed'), 0),
            current_badge_id = (SELECT pp.current_badge_id FROM public.provider_points pp WHERE pp.provider_id = p.id),
            updated_at = NOW()
        WHERE p.tenant_id = $1
      $q$ USING p_tenant_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('_provider_aggregates_recomputed',
        jsonb_build_object('providers_affected', v_count, 'via', 'recompute'));
    EXCEPTION WHEN OTHERS THEN
      v_counts := v_counts || jsonb_build_object('_provider_aggregates_recomputed',
        jsonb_build_object('skipped', 'error', 'error', SQLERRM));
    END;
  END IF;

  -- ── RECOMPUTE: wallet balances from surviving transactions (multi-tenant safe).
  --    Clamped at >= 0 to honour the user_wallets.balance CHECK constraint.
  IF p_dry_run THEN
    v_counts := v_counts || jsonb_build_object('_wallet_balances_recomputed',
      jsonb_build_object('wallets_affected', COALESCE(array_length(v_wallet_ids, 1), 0), 'via', 'recompute_preview'));
  ELSIF array_length(v_wallet_ids, 1) IS NOT NULL THEN
    BEGIN
      UPDATE public.user_wallets w
      SET balance = GREATEST(
            COALESCE((
              SELECT SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE -wt.amount END)
              FROM public.wallet_transactions wt WHERE wt.wallet_id = w.id
            ), 0), 0),
          updated_at = NOW()
      WHERE w.id = ANY(v_wallet_ids);
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('_wallet_balances_recomputed',
        jsonb_build_object('wallets_affected', v_count, 'via', 'recompute'));
    EXCEPTION WHEN OTHERS THEN
      v_counts := v_counts || jsonb_build_object('_wallet_balances_recomputed',
        jsonb_build_object('skipped', 'error', 'error', SQLERRM));
    END;
  ELSE
    v_counts := v_counts || jsonb_build_object('_wallet_balances_recomputed',
      jsonb_build_object('wallets_affected', 0, 'via', 'recompute'));
  END IF;

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
  '764: Superadmin clean-slate (692 + terminal commerce). Clears terminal orders/assets/campaigns, provider Paystack terminal payment history, and virtual-terminal setup requests for the tenant. Catalog/config (terminal_products, vendor configs, provider terminal credentials) is preserved. Each op isolated; idempotent; dry-run by default.';

REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) TO service_role;
