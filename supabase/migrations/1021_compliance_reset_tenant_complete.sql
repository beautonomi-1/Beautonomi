-- ============================================================================
-- 1021: Complete atomic tenant transactional reset (after 1001)
-- ============================================================================

DROP FUNCTION IF EXISTS public.brand_reset_tenant_data(uuid);

CREATE OR REPLACE FUNCTION public.brand_reset_tenant_data(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $brand$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_count bigint;
  v_brief_trig boolean := false;
  v_asset_trig boolean := false;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'brand_brief_versions'
      AND t.tgname = 'brand_brief_versions_no_update' AND NOT t.tgisinternal
  ) INTO v_brief_trig;
  IF v_brief_trig AND to_regclass('public.brand_brief_versions') IS NOT NULL THEN
    ALTER TABLE public.brand_brief_versions DISABLE TRIGGER brand_brief_versions_no_update;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'brand_asset_versions'
      AND t.tgname = 'brand_asset_versions_no_update' AND NOT t.tgisinternal
  ) INTO v_asset_trig;
  IF v_asset_trig AND to_regclass('public.brand_asset_versions') IS NOT NULL THEN
    ALTER TABLE public.brand_asset_versions DISABLE TRIGGER brand_asset_versions_no_update;
  END IF;

  IF to_regclass('public.brand_brief_versions') IS NOT NULL THEN
    DELETE FROM public.brand_brief_versions WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_brief_versions', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_proof_comments') IS NOT NULL THEN
    DELETE FROM public.brand_proof_comments WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_proof_comments', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_evidence_packs') IS NOT NULL THEN
    DELETE FROM public.brand_evidence_packs WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_evidence_packs', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_asset_versions') IS NOT NULL THEN
    DELETE FROM public.brand_asset_versions WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_asset_versions', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_assets') IS NOT NULL THEN
    DELETE FROM public.brand_assets WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_assets', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_checklist_instances') IS NOT NULL THEN
    DELETE FROM public.brand_checklist_instances WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_checklist_instances', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_tasks') IS NOT NULL THEN
    DELETE FROM public.brand_tasks WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_tasks', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_approvals') IS NOT NULL THEN
    DELETE FROM public.brand_approvals WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_approvals', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_metric_entries') IS NOT NULL THEN
    DELETE FROM public.brand_metric_entries WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_metric_entries', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_placements') IS NOT NULL THEN
    DELETE FROM public.brand_placements WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_placements', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_activity') IS NOT NULL THEN
    DELETE FROM public.brand_activity WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_activity', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_briefs') IS NOT NULL THEN
    UPDATE public.brand_briefs SET accepted_campaign_id = NULL WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_briefs_accepted_campaign_unlink', jsonb_build_object('rows', v_count, 'via', 'brand'));
    DELETE FROM public.brand_campaigns WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_campaigns', jsonb_build_object('rows', v_count, 'via', 'brand'));
    DELETE FROM public.brand_briefs WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_briefs', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;
  IF to_regclass('public.brand_period_snapshots') IS NOT NULL THEN
    DELETE FROM public.brand_period_snapshots WHERE tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('brand_period_snapshots', jsonb_build_object('rows', v_count, 'via', 'brand'));
  END IF;

  IF v_brief_trig AND to_regclass('public.brand_brief_versions') IS NOT NULL THEN
    ALTER TABLE public.brand_brief_versions ENABLE TRIGGER brand_brief_versions_no_update;
  END IF;
  IF v_asset_trig AND to_regclass('public.brand_asset_versions') IS NOT NULL THEN
    ALTER TABLE public.brand_asset_versions ENABLE TRIGGER brand_asset_versions_no_update;
  END IF;

  RETURN v_counts;
END;
$brand$;

REVOKE ALL ON FUNCTION public.brand_reset_tenant_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_reset_tenant_data(uuid) TO service_role;

-- ============================================================================
-- compliance_reset_tenant_transactions (replaces 1001 body)
-- ============================================================================
-- Adds transactional tables that survive a reset because their booking FKs are
-- ON DELETE SET NULL (PayCloud / Yoco payment history) or were never in the plan
-- (customer memberships, terminal merchant onboarding applications).
--
-- PRESERVED (config / spine — same policy as Paystack terminal credentials):
--   tenant_paycloud_apps, paycloud_merchants, paycloud_terminals,
--   provider_paycloud_settings, provider_yoco_integrations, provider_yoco_devices,
--   provider_yoco_terminals, provider_yoco_webhooks (webhook endpoint config),
--   membership_plans / memberships (plan catalog).
--
-- PRESERVED (cross-tenant user-global — same policy as referrals / user_coupons):
--   platform customer_memberships rows with provider_id IS NULL. Only provider-linked
--   customer_memberships and salon user_memberships are wiped.
--
-- NOTE: transactional storage purge (explore, messages, brand assets, merchant
-- docs, consent PDFs, etc.) runs in the admin reset route after this RPC commits.

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
  v_brand        JSONB;

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

    {"t": "content_reports", "where": "tenant_id = $1 OR (target_type = ''explore_post'' AND target_id IN (SELECT id FROM public.explore_posts WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))) OR (target_type = ''explore_comment'' AND target_id IN (SELECT id FROM public.explore_comments WHERE post_id IN (SELECT id FROM public.explore_posts WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))) OR (target_type = ''review'' AND target_id IN (SELECT id FROM public.reviews WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))) OR (target_type = ''product_review'' AND target_id IN (SELECT id FROM public.product_reviews WHERE order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))) OR (target_type = ''message'' AND target_id IN (SELECT id FROM public.messages WHERE conversation_id IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))))", "via": "content_safety"},
    {"t": "payment_transactions", "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "safety_events", "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "gods_eye_audit_log", "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "provider_location_events", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},

    {"t": "reviews",                     "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "product_order_items",         "where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)", "via": "order"},
    {"t": "product_return_requests",     "where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)", "via": "order"},
    {"t": "promotion_usage",             "where": "promotion_id IN (SELECT id FROM public.promotions WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1) OR product_order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)", "via": "promotion"},

    {"t": "terminal_campaign_recipients", "where": "campaign_id IN (SELECT id FROM public.terminal_campaigns WHERE tenant_id = $1)", "via": "terminal_campaign"},
    {"t": "terminal_campaigns",          "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "terminal_admin_notes",        "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "provider_terminal_payment_allocations", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_paystack_terminal_payments", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_paystack_virtual_terminal_setup_requests", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "terminal_assets",             "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "terminal_orders",             "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "fee_reconciliations",         "where": "tenant_id = $1", "via": "tenant_id"},

    {"t": "paycloud_webhook_events",     "where": "tenant_id = $1 OR payment_id IN (SELECT id FROM public.provider_paycloud_payments WHERE tenant_id = $1) OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "paycloud"},
    {"t": "provider_paycloud_payments",  "where": "tenant_id = $1", "via": "tenant_id"},

    {"t": "provider_yoco_webhook_events","where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR webhook_id IN (SELECT w.webhook_id FROM public.provider_yoco_webhooks w WHERE w.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))", "via": "yoco"},
    {"t": "provider_yoco_refunds",       "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR payment_id IN (SELECT p.yoco_payment_id FROM public.provider_yoco_payments p WHERE p.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) AND p.yoco_payment_id IS NOT NULL)", "via": "yoco"},
    {"t": "provider_yoco_payments",      "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},

    {"t": "terminal_merchant_application_documents", "where": "application_id IN (SELECT id FROM public.terminal_merchant_applications WHERE tenant_id = $1)", "via": "merchant_application"},
    {"t": "terminal_merchant_application_events",    "where": "application_id IN (SELECT id FROM public.terminal_merchant_applications WHERE tenant_id = $1)", "via": "merchant_application"},
    {"t": "terminal_merchant_applications",          "where": "tenant_id = $1", "via": "tenant_id"},

    {"t": "customer_memberships",        "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "user_memberships",            "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},


    {"t": "product_reviews", "where": "order_id IN (SELECT id FROM public.product_orders WHERE tenant_id = $1)", "via": "order"},
    {"t": "payments", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "payment"},
    {"t": "payment_disputes", "where": "tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "payment"},
    {"t": "wallet_bank_refund_requests", "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "whatsapp_customer_messages", "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "whatsapp_retention_sends", "where": "booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "booking_pre"},
    {"t": "provider_pay_runs", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "cart_items", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "abandoned_cart_reminders", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "abandoned_booking_reengagement", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "travel_routes", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "ads_budget_orders", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "ads_events", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "ads_events_daily", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},

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
    {"t": "user_reports",                "where": "tenant_id = $1 OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)", "via": "tenant_or_booking"},
    {"t": "user_verifications",          "where": "tenant_id = $1", "via": "tenant_id"},

    {"t": "booking_holds",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_client_ratings",     "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "sales",                       "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "messages",                    "where": "conversation_id IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))", "via": "conversation"},
    {"t": "conversations",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "support_mail_messages", "where": "mailbox_id IN (SELECT id FROM public.support_mailboxes WHERE tenant_id = $1)", "via": "support_mailbox"},
    {"t": "support_mail_ack_log", "where": "mailbox_id IN (SELECT id FROM public.support_mailboxes WHERE tenant_id = $1)", "via": "support_mailbox"},
    {"t": "support_tickets", "where": "tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "support"},
    {"t": "on_demand_requests",          "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "custom_requests",             "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "group_bookings",              "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_point_transactions", "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_milestones",         "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "provider_points",             "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "explore_posts",               "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)", "via": "provider"},
    {"t": "explore_sounds",              "where": "owner_type = ''provider'' AND provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) AND NOT EXISTS (SELECT 1 FROM public.explore_posts ep WHERE ep.sound_id = explore_sounds.id)", "via": "explore_sound"},
    {"t": "stock_movements",             "where": "provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) AND movement_type IN (''sale'', ''sale_refund'', ''booking'', ''booking_revert'', ''cancel'', ''return'')", "via": "provider_stock"},
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
    EXECUTE 'SELECT COALESCE(array_agg(DISTINCT wallet_id), ARRAY[]::uuid[]) FROM public.wallet_transactions WHERE tenant_id = $1'
      INTO v_wallet_ids USING p_tenant_id;
  END IF;


  -- Scoped notifications (data/metadata keys only — no cross-tenant user wipe).
  IF to_regclass('public.notifications') IS NULL THEN
    v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('skipped', 'table_missing'));
  ELSE
    IF p_dry_run THEN
      EXECUTE $q$
        SELECT COUNT(*)::bigint FROM public.notifications n
        WHERE
          (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'booking_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'booking_id')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'group_booking_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'group_booking_id')::uuid IN (SELECT id FROM public.group_bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'source_booking_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'source_booking_id')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'product_order_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'product_order_id')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'order_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'order_id')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'conversation_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'conversation_id')::uuid IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'request_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'request_id')::uuid IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'offer_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'offer_id')::uuid IN (SELECT id FROM public.custom_offers WHERE request_id IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'review_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'review_id')::uuid IN (SELECT id FROM public.reviews WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'dispute_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'dispute_id')::uuid IN (SELECT id FROM public.payment_disputes WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'payment_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'payment_id')::uuid IN (SELECT id FROM public.payments WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'ticket_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'ticket_id')::uuid IN (SELECT id FROM public.support_tickets WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'campaign_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'campaign_id')::uuid IN (SELECT id FROM public.ads_campaigns WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'charge_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'charge_id')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'additional_charge_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'additional_charge_id')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
      $q$ INTO v_count USING p_tenant_id;
    ELSE
      EXECUTE $q$
        WITH d AS (
          DELETE FROM public.notifications n
          WHERE
            (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'booking_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'booking_id')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'group_booking_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'group_booking_id')::uuid IN (SELECT id FROM public.group_bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'source_booking_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'source_booking_id')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'product_order_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'product_order_id')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'order_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'order_id')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'conversation_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'conversation_id')::uuid IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'request_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'request_id')::uuid IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'offer_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'offer_id')::uuid IN (SELECT id FROM public.custom_offers WHERE request_id IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'review_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'review_id')::uuid IN (SELECT id FROM public.reviews WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'dispute_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'dispute_id')::uuid IN (SELECT id FROM public.payment_disputes WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'payment_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'payment_id')::uuid IN (SELECT id FROM public.payments WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'ticket_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'ticket_id')::uuid IN (SELECT id FROM public.support_tickets WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'campaign_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'campaign_id')::uuid IN (SELECT id FROM public.ads_campaigns WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'charge_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'charge_id')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
            OR (NULLIF((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'additional_charge_id', '') IS NOT NULL AND ((n.data || COALESCE(n.metadata, '{}'::jsonb))->>'additional_charge_id')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          RETURNING 1
        )
        SELECT COUNT(*)::bigint FROM d
      $q$ INTO v_count USING p_tenant_id;
    END IF;
    v_counts := v_counts || jsonb_build_object('notifications', jsonb_build_object('rows', v_count, 'via', 'payload_keys'));
  END IF;

  IF to_regclass('public.notification_delivery_queue') IS NULL THEN
    v_counts := v_counts || jsonb_build_object('notification_delivery_queue', jsonb_build_object('skipped', 'table_missing'));
  ELSE
    IF p_dry_run THEN
      EXECUTE $q$
        SELECT COUNT(*)::bigint FROM public.notification_delivery_queue q
        WHERE
          q.booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)
          OR (NULLIF(q.payload #>> '{_queue_meta,tenant_id}', '') IS NOT NULL AND (q.payload #>> '{_queue_meta,tenant_id}')::uuid = $1)
          OR (NULLIF(q.payload #>> '{data,booking_id}', '') IS NOT NULL AND (q.payload #>> '{data,booking_id}')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
          OR (NULLIF(q.payload #>> '{data,group_booking_id}', '') IS NOT NULL AND (q.payload #>> '{data,group_booking_id}')::uuid IN (SELECT id FROM public.group_bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,source_booking_id}', '') IS NOT NULL AND (q.payload #>> '{data,source_booking_id}')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
          OR (NULLIF(q.payload #>> '{data,product_order_id}', '') IS NOT NULL AND (q.payload #>> '{data,product_order_id}')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
          OR (NULLIF(q.payload #>> '{data,order_id}', '') IS NOT NULL AND (q.payload #>> '{data,order_id}')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
          OR (NULLIF(q.payload #>> '{data,conversation_id}', '') IS NOT NULL AND (q.payload #>> '{data,conversation_id}')::uuid IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,request_id}', '') IS NOT NULL AND (q.payload #>> '{data,request_id}')::uuid IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,offer_id}', '') IS NOT NULL AND (q.payload #>> '{data,offer_id}')::uuid IN (SELECT id FROM public.custom_offers WHERE request_id IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))))
          OR (NULLIF(q.payload #>> '{data,review_id}', '') IS NOT NULL AND (q.payload #>> '{data,review_id}')::uuid IN (SELECT id FROM public.reviews WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,dispute_id}', '') IS NOT NULL AND (q.payload #>> '{data,dispute_id}')::uuid IN (SELECT id FROM public.payment_disputes WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,payment_id}', '') IS NOT NULL AND (q.payload #>> '{data,payment_id}')::uuid IN (SELECT id FROM public.payments WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,ticket_id}', '') IS NOT NULL AND (q.payload #>> '{data,ticket_id}')::uuid IN (SELECT id FROM public.support_tickets WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,campaign_id}', '') IS NOT NULL AND (q.payload #>> '{data,campaign_id}')::uuid IN (SELECT id FROM public.ads_campaigns WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,charge_id}', '') IS NOT NULL AND (q.payload #>> '{data,charge_id}')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          OR (NULLIF(q.payload #>> '{data,additional_charge_id}', '') IS NOT NULL AND (q.payload #>> '{data,additional_charge_id}')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
      $q$ INTO v_count USING p_tenant_id;
    ELSE
      EXECUTE $q$
        WITH d AS (
          DELETE FROM public.notification_delivery_queue q
          WHERE
            q.booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)
            OR (NULLIF(q.payload #>> '{_queue_meta,tenant_id}', '') IS NOT NULL AND (q.payload #>> '{_queue_meta,tenant_id}')::uuid = $1)
            OR (NULLIF(q.payload #>> '{data,booking_id}', '') IS NOT NULL AND (q.payload #>> '{data,booking_id}')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
            OR (NULLIF(q.payload #>> '{data,group_booking_id}', '') IS NOT NULL AND (q.payload #>> '{data,group_booking_id}')::uuid IN (SELECT id FROM public.group_bookings WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,source_booking_id}', '') IS NOT NULL AND (q.payload #>> '{data,source_booking_id}')::uuid IN (SELECT id FROM public.bookings WHERE tenant_id = $1))
            OR (NULLIF(q.payload #>> '{data,product_order_id}', '') IS NOT NULL AND (q.payload #>> '{data,product_order_id}')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
            OR (NULLIF(q.payload #>> '{data,order_id}', '') IS NOT NULL AND (q.payload #>> '{data,order_id}')::uuid IN (SELECT id FROM public.product_orders WHERE tenant_id = $1))
            OR (NULLIF(q.payload #>> '{data,conversation_id}', '') IS NOT NULL AND (q.payload #>> '{data,conversation_id}')::uuid IN (SELECT id FROM public.conversations WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,request_id}', '') IS NOT NULL AND (q.payload #>> '{data,request_id}')::uuid IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,offer_id}', '') IS NOT NULL AND (q.payload #>> '{data,offer_id}')::uuid IN (SELECT id FROM public.custom_offers WHERE request_id IN (SELECT id FROM public.custom_requests WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1))))
            OR (NULLIF(q.payload #>> '{data,review_id}', '') IS NOT NULL AND (q.payload #>> '{data,review_id}')::uuid IN (SELECT id FROM public.reviews WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,dispute_id}', '') IS NOT NULL AND (q.payload #>> '{data,dispute_id}')::uuid IN (SELECT id FROM public.payment_disputes WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,payment_id}', '') IS NOT NULL AND (q.payload #>> '{data,payment_id}')::uuid IN (SELECT id FROM public.payments WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1) OR booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,ticket_id}', '') IS NOT NULL AND (q.payload #>> '{data,ticket_id}')::uuid IN (SELECT id FROM public.support_tickets WHERE tenant_id = $1 OR provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,campaign_id}', '') IS NOT NULL AND (q.payload #>> '{data,campaign_id}')::uuid IN (SELECT id FROM public.ads_campaigns WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,charge_id}', '') IS NOT NULL AND (q.payload #>> '{data,charge_id}')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
            OR (NULLIF(q.payload #>> '{data,additional_charge_id}', '') IS NOT NULL AND (q.payload #>> '{data,additional_charge_id}')::uuid IN (SELECT id FROM public.additional_charges WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)))
          RETURNING 1
        )
        SELECT COUNT(*)::bigint FROM d
      $q$ INTO v_count USING p_tenant_id;
    END IF;
    v_counts := v_counts || jsonb_build_object('notification_delivery_queue', jsonb_build_object('rows', v_count, 'via', 'queue_scope'));
  END IF;

  -- Main plan: missing tables skipped via to_regclass; real errors abort the transaction.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    v_t     := v_entry->>'t';
    v_where := v_entry->>'where';
    v_via   := COALESCE(v_entry->>'via', 'scoped');

    IF to_regclass('public.' || v_t) IS NULL THEN
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('skipped', 'table_missing'));
      CONTINUE;
    END IF;

    IF v_t = 'bookings' AND to_regclass('public.user_referrals') IS NOT NULL THEN
      IF p_dry_run THEN
        EXECUTE 'SELECT COUNT(*)::bigint FROM public.user_referrals WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1)' INTO v_count USING p_tenant_id;
      ELSE
        EXECUTE 'WITH u AS (UPDATE public.user_referrals SET booking_id = NULL WHERE booking_id IN (SELECT id FROM public.bookings WHERE tenant_id = $1) RETURNING 1) SELECT COUNT(*)::bigint FROM u' INTO v_count USING p_tenant_id;
      END IF;
      v_counts := v_counts || jsonb_build_object('user_referrals_booking_unlink', jsonb_build_object('rows', v_count, 'via', 'booking_pre'));
    END IF;

    IF v_t = 'stock_movements' AND NOT p_dry_run AND to_regclass('public.stock_movements') IS NOT NULL THEN
      EXECUTE $q$
        UPDATE public.product_variants pv
        SET quantity = pv.quantity - agg.delta, updated_at = NOW()
        FROM (
          SELECT sm.product_variant_id, SUM(sm.quantity_delta) AS delta
          FROM public.stock_movements sm
          WHERE sm.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)
            AND sm.product_variant_id IS NOT NULL
            AND sm.movement_type IN ('sale', 'sale_refund', 'booking', 'booking_revert', 'cancel', 'return')
          GROUP BY sm.product_variant_id
        ) agg
        WHERE pv.id = agg.product_variant_id
      $q$ USING p_tenant_id;
      EXECUTE $q$
        UPDATE public.products p
        SET quantity = p.quantity - agg.delta, updated_at = NOW()
        FROM (
          SELECT sm.product_id, SUM(sm.quantity_delta) AS delta
          FROM public.stock_movements sm
          WHERE sm.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)
            AND sm.product_variant_id IS NULL
            AND sm.movement_type IN ('sale', 'sale_refund', 'booking', 'booking_revert', 'cancel', 'return')
          GROUP BY sm.product_id
        ) agg
        WHERE p.id = agg.product_id
      $q$ USING p_tenant_id;
      v_counts := v_counts || jsonb_build_object('_stock_movements_reversed', jsonb_build_object('via', 'recompute'));
    ELSIF v_t = 'stock_movements' AND p_dry_run THEN
      v_counts := v_counts || jsonb_build_object('_stock_movements_reversed', jsonb_build_object('via', 'recompute_preview'));
    END IF;

    IF p_dry_run THEN
      v_sql := format('SELECT COUNT(*) FROM public.%I WHERE %s', v_t, v_where);
      EXECUTE v_sql INTO v_count USING p_tenant_id;
    ELSE
      v_sql := format('WITH d AS (DELETE FROM public.%I WHERE %s RETURNING 1) SELECT COUNT(*) FROM d', v_t, v_where);
      EXECUTE v_sql INTO v_count USING p_tenant_id;
    END IF;
    v_counts := v_counts || jsonb_build_object(v_t, jsonb_build_object('rows', v_count, 'via', v_via));
  END LOOP;


  IF p_dry_run THEN
    v_brand := '{}'::jsonb;
    IF to_regclass('public.brand_brief_versions') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_brief_versions WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_brief_versions', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_proof_comments') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_proof_comments WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_proof_comments', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_evidence_packs') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_evidence_packs WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_evidence_packs', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_asset_versions') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_asset_versions WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_asset_versions', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_assets') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_assets WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_assets', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_checklist_instances') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_checklist_instances WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_checklist_instances', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_tasks') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_tasks WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_tasks', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_approvals') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_approvals WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_approvals', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_metric_entries') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_metric_entries WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_metric_entries', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_placements') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_placements WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_placements', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_activity') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_activity WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_activity', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_campaigns') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_campaigns WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_campaigns', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_briefs') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_briefs WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_briefs', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    IF to_regclass('public.brand_period_snapshots') IS NOT NULL THEN
      EXECUTE 'SELECT COUNT(*) FROM public.brand_period_snapshots WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_brand := v_brand || jsonb_build_object('brand_period_snapshots', jsonb_build_object('rows', v_count, 'via', 'brand_preview'));
    END IF;
    v_counts := v_counts || v_brand;
  ELSE
    v_brand := public.brand_reset_tenant_data(p_tenant_id);
    v_counts := v_counts || v_brand;
  END IF;

  IF to_regclass('public.support_mailboxes') IS NOT NULL THEN
    IF p_dry_run THEN
      EXECUTE 'SELECT COUNT(*) FROM public.support_mailboxes WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
      v_counts := v_counts || jsonb_build_object('_support_mailbox_counters_reset', jsonb_build_object('mailboxes_affected', v_count, 'via', 'recompute_preview'));
    ELSE
      EXECUTE $q$
        UPDATE public.support_mailboxes
        SET last_run_imported = 0, last_run_appended = 0, last_run_skipped = 0, last_run_failed = 0, updated_at = NOW()
        WHERE tenant_id = $1
      $q$ USING p_tenant_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('_support_mailbox_counters_reset', jsonb_build_object('mailboxes_affected', v_count, 'via', 'recompute'));
    END IF;
  END IF;

  -- Zero PayCloud terminal cached counters after payment history wipe (config rows preserved).
  IF to_regclass('public.paycloud_terminals') IS NOT NULL THEN
    IF p_dry_run THEN
      EXECUTE 'SELECT COUNT(*) FROM public.paycloud_terminals WHERE tenant_id = $1'
        INTO v_count USING p_tenant_id;
      v_counts := v_counts || jsonb_build_object('_paycloud_terminal_counters_reset',
        jsonb_build_object('terminals_affected', v_count, 'via', 'recompute_preview'));
    ELSE
      EXECUTE $q$
        UPDATE public.paycloud_terminals
        SET total_transactions = 0,
            total_amount = 0,
            in_flight_payment_id = NULL,
            last_error = NULL,
            updated_at = NOW()
        WHERE tenant_id = $1
      $q$ USING p_tenant_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_counts := v_counts || jsonb_build_object('_paycloud_terminal_counters_reset',
        jsonb_build_object('terminals_affected', v_count, 'via', 'recompute'));
    END IF;
  END IF;

  -- RECOMPUTE: provider cached aggregates from surviving rows.
  IF p_dry_run THEN
    EXECUTE 'SELECT COUNT(*) FROM public.providers WHERE tenant_id = $1' INTO v_count USING p_tenant_id;
    v_counts := v_counts || jsonb_build_object('_provider_aggregates_recomputed',
      jsonb_build_object('providers_affected', v_count, 'via', 'recompute_preview'));
  ELSE
    EXECUTE $q$
      UPDATE public.providers p
      SET review_count   = COALESCE((SELECT COUNT(*) FROM public.reviews r WHERE r.provider_id = p.id), 0),
          rating_average = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM public.reviews r WHERE r.provider_id = p.id), 0),
          total_bookings = COALESCE((SELECT COUNT(*) FROM public.bookings b WHERE b.provider_id = p.id AND b.status = 'completed'), 0),
          total_paid_out = COALESCE((SELECT SUM(po.net_amount) FROM public.payouts po WHERE po.provider_id = p.id AND po.status = 'completed'), 0),
          current_badge_id = (SELECT pp.current_badge_id FROM public.provider_points pp WHERE pp.provider_id = p.id),
          updated_at = NOW()
      WHERE p.tenant_id = $1
    $q$ USING p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('_provider_aggregates_recomputed',
      jsonb_build_object('providers_affected', v_count, 'via', 'recompute'));
  END IF;


  IF p_dry_run THEN
    EXECUTE 'SELECT COUNT(*) FROM public.provider_clients WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)' INTO v_count USING p_tenant_id;
    v_counts := v_counts || jsonb_build_object('_provider_clients_recomputed', jsonb_build_object('clients_affected', v_count, 'via', 'recompute_preview'));
    EXECUTE 'SELECT COUNT(*) FROM public.provider_ops_cases WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)' INTO v_count USING p_tenant_id;
    v_counts := v_counts || jsonb_build_object('_provider_ops_cases_recomputed', jsonb_build_object('cases_affected', v_count, 'via', 'recompute_preview'));
  ELSE
    EXECUTE $q$
      UPDATE public.provider_clients pc
      SET
        total_bookings = COALESCE(sub.cnt, 0),
        total_spent = COALESCE(sub.spent, 0),
        last_service_date = sub.last_service,
        updated_at = NOW()
      FROM (
        SELECT b.provider_id, b.customer_id,
          COUNT(*) FILTER (WHERE b.status = 'completed') AS cnt,
          SUM(b.total_amount) FILTER (WHERE b.status = 'completed') AS spent,
          MAX(b.completed_at) FILTER (WHERE b.status = 'completed') AS last_service
        FROM public.bookings b
        WHERE b.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)
        GROUP BY b.provider_id, b.customer_id
      ) sub
      WHERE pc.provider_id = sub.provider_id AND pc.customer_id = sub.customer_id
    $q$ USING p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('_provider_clients_recomputed', jsonb_build_object('clients_affected', v_count, 'via', 'recompute'));
    UPDATE public.provider_clients pc
    SET total_bookings = 0, total_spent = 0, last_service_date = NULL, updated_at = NOW()
    WHERE pc.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = p_tenant_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.provider_id = pc.provider_id AND b.customer_id = pc.customer_id AND b.status = 'completed'
      );
    IF to_regclass('public.provider_ops_cases') IS NOT NULL THEN
      UPDATE public.provider_ops_cases c
      SET
        first_booking_at = sub.first_at,
        last_qualifying_booking_at = sub.last_at,
        qualifying_booking_count = COALESCE(sub.cnt, 0),
        updated_at = NOW()
      FROM (
        SELECT b.provider_id,
          MIN(b.created_at) AS first_at,
          MAX(b.created_at) AS last_at,
          COUNT(*)::integer AS cnt
        FROM public.bookings b
        WHERE b.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = p_tenant_id)
          AND public.is_qualifying_booking_status(b.status)
        GROUP BY b.provider_id
      ) sub
      WHERE c.provider_id = sub.provider_id
        AND c.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = p_tenant_id);
      UPDATE public.provider_ops_cases c
      SET first_booking_at = NULL, last_qualifying_booking_at = NULL, qualifying_booking_count = 0, updated_at = NOW()
      WHERE c.provider_id IN (SELECT id FROM public.providers WHERE tenant_id = p_tenant_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.provider_id = c.provider_id AND public.is_qualifying_booking_status(b.status)
        );
      EXECUTE 'SELECT COUNT(*)::bigint FROM public.provider_ops_cases WHERE provider_id IN (SELECT id FROM public.providers WHERE tenant_id = $1)'
        INTO v_count USING p_tenant_id;
      v_counts := v_counts || jsonb_build_object('_provider_ops_cases_recomputed', jsonb_build_object('cases_affected', v_count, 'via', 'recompute'));
    END IF;
  END IF;

  -- ── RECOMPUTE: wallet balances from surviving transactions (multi-tenant safe).
  --    Clamped at >= 0 to honour the user_wallets.balance CHECK constraint.
  IF p_dry_run THEN
    v_counts := v_counts || jsonb_build_object('_wallet_balances_recomputed',
      jsonb_build_object('wallets_affected', COALESCE(array_length(v_wallet_ids, 1), 0), 'via', 'recompute_preview'));
  ELSIF array_length(v_wallet_ids, 1) IS NOT NULL THEN
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
  '1021: Atomic tenant transactional reset (765 + PayCloud/Yoco payment history, salon memberships, merchant onboarding apps). Platform memberships (null provider_id) and config/spine preserved. Fails closed on errors; idempotent; dry-run by default.';

REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_reset_tenant_transactions(UUID, BOOLEAN, BOOLEAN) TO service_role;
