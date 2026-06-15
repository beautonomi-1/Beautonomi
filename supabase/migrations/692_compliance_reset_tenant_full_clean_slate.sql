-- ============================================================================
-- 692: compliance_reset_tenant_transactions — full, reliable clean slate
-- ============================================================================
-- Supersedes 508/601/602/603. Three goals:
--
--   1) COMPLETENESS — a tenant "clean slate" must clear ALL transactional and
--      derived/activity data attributable to the tenant, not just bookings.
--      That includes provider gamification, group bookings, explore posts,
--      waitlist, ad campaigns, payouts, provider invoices, recurring
--      appointments, VAT reminders, payment webhook events, the double-entry
--      ledger, promotion usage, gift-card/loyalty redemptions, and the
--      booking-attributable slice of the loyalty points ledger.
--
--   2) RECOMPUTE — every cached aggregate derived from the deleted rows is
--      recomputed from the SURVIVING rows (not blind-zeroed), so the platform
--      starts from a truthful, consistent state:
--        • providers.{review_count, rating_average, total_bookings,
--          total_paid_out, current_badge_id}
--        • user_wallets.balance (recomputed from remaining wallet_transactions;
--          multi-tenant safe — see below)
--
--   3) RELIABILITY — previously one wrong column/table aborted the ENTIRE reset
--      (cause of the 601/602/603 hotfixes). Each table op and each recompute now
--      runs inside its own savepoint with EXCEPTION handling: a failure is
--      recorded as {"skipped":"error","error": <SQLERRM>} in the per-table
--      report and the reset continues. The function is idempotent, so a partial
--      run can simply be re-executed. Dry-run mutates nothing.
--
-- ORDERING: tables whose link to the tenant is via a booking_id that is
-- ON DELETE SET NULL (loyalty_points_ledger) or a soft reference_id with no FK
-- (loyalty_point_transactions) are deleted BEFORE bookings — otherwise the link
-- is severed first and the rows are orphaned (the same trap that left
-- group_bookings behind). Children are deleted before their parents so the
-- per-table counts in the report are accurate rather than post-cascade zeros.
--
-- WALLET SAFETY: user_wallets.balance is a cross-tenant aggregate (a customer
-- can transact across tenants). We snapshot the wallet ids touched by THIS
-- tenant before deleting its wallet_transactions, then recompute those wallets'
-- balances from whatever transactions survive (other tenants). For a single
-- tenant that nets to 0; for multi-tenant customers it preserves correctness.
--
-- INTENTIONALLY PRESERVED:
--   • Structural spine: users, providers, services/offerings, products,
--     catalog, badge catalog (provider_badges), GL accounts, tenant config,
--     platform settings, loyalty/coupon CONFIG.
--   • Cross-tenant, user-global rows that cannot be safely attributed to a
--     single tenant: referrals, user_coupons, loyalty_milestone_awards, the
--     non-booking slice of the loyalty ledger, and the global webhook_events
--     log. A single-tenant deployment that wants these gone should run a
--     dedicated platform-wide purge rather than corrupt other tenants here.
--
-- Safeguards (unchanged): SECURITY DEFINER + service_role only; tenant must
-- exist; default ZA tenant blocked unless p_allow_default_tenant := true;
-- dry-run returns counts only. Superadmin gate + slug confirmation + immutable
-- audit row live in the Next.js API layer (/api/admin/compliance/reset-tenant).

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
  '692: Superadmin clean-slate. Wipes all tenant-attributable transactional + derived data (bookings & children, payments, ledger/journal, orders, reviews, conversations, notifications, support, gamification, group bookings, explore, waitlist, ads, payouts, provider invoices, recurring appointments, VAT reminders, payment webhook events, promotion usage, gift-card/loyalty redemptions, booking-linked loyalty ledger) and recomputes cached aggregates (provider rating/reviews/bookings/payout/badge; wallet balances from surviving rows). Preserves structural spine, badge/coupon/loyalty config, and cross-tenant user-global rows (referrals, user_coupons, milestone awards, non-booking loyalty, global webhooks). Each op isolated (failures reported, not fatal); idempotent; dry-run by default. Call via /api/admin/compliance/reset-tenant.';

REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) TO service_role;
