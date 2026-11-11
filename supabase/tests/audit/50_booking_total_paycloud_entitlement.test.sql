-- Tests for 10142_booking_total_paycloud_entitlement.sql
-- Run: node supabase/tests/audit/run.mjs --docker beautonomi-audit-db
\set ON_ERROR_STOP on
BEGIN;
\ir 00_fixture.sql

-- =============================================================================
-- F2-13  VAT-inclusive booking (fixture tax_inclusive=true) still inserts
-- =============================================================================
SELECT pg_temp.audit_booking('60000000-0000-4000-8000-000000000050');
SELECT pg_temp.audit_assert(
  EXISTS (SELECT 1 FROM public.bookings WHERE id = '60000000-0000-4000-8000-000000000050' AND total_amount = 333.33),
  'F2-13 VAT-inclusive fixture total still accepted'
);

-- Exclusive-style total (subtotal + tax + fee) is rejected when tax_inclusive
DO $$
BEGIN
  BEGIN
    INSERT INTO public.bookings (id, booking_number, customer_id, provider_id, status, location_type, scheduled_at,
        subtotal, total_amount, tax_amount, tax_rate, tax_inclusive, platform_fee_amount, service_fee_amount, platform_fee_paid_by, service_fee_paid_by,
        currency, payment_status, tenant_id, booking_source, commission_percentage_snapshot)
    VALUES ('60000000-0000-4000-8000-000000000051', 'AUD-excl-rejected',
        '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001',
        'confirmed', 'at_salon', now() + interval '1 day',
        318.33, 374.85, 41.52, 15, true, 15.00, 15.00, 'customer', 'customer',
        'ZAR', 'pending', '10000000-0000-4000-8000-000000000001', 'online', 15);
    RAISE EXCEPTION 'FAIL: F2-13 exclusive total accepted on tax_inclusive booking';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(SQLERRM LIKE '%Total amount validation failed%', 'F2-13 exclusive total rejected when tax_inclusive');
  END;
END $$;

-- Discount-only formula (ignoring membership discount) is rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO public.bookings (id, booking_number, customer_id, provider_id, status, location_type, scheduled_at,
        subtotal, total_amount, tax_amount, tax_rate, tax_inclusive, platform_fee_amount, service_fee_amount,
        membership_discount_amount, platform_fee_paid_by, service_fee_paid_by,
        currency, payment_status, tenant_id, booking_source, commission_percentage_snapshot)
    VALUES ('60000000-0000-4000-8000-000000000052', 'AUD-disc-only',
        '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001',
        'confirmed', 'at_salon', now() + interval '1 day',
        318.33, 333.33, 41.52, 15, true, 15.00, 15.00,
        10.00, 'customer', 'customer',
        'ZAR', 'pending', '10000000-0000-4000-8000-000000000001', 'online', 15);
    RAISE EXCEPTION 'FAIL: F2-13 discount-only total accepted while membership discount applied';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.audit_assert(SQLERRM LIKE '%Total amount validation failed%', 'F2-13 all-discounts formula required');
  END;
END $$;

-- tax_inclusive=false accepts exclusive total (subtotal 100 + tax 15)
INSERT INTO public.bookings (id, booking_number, customer_id, provider_id, status, location_type, scheduled_at,
    subtotal, total_amount, tax_amount, tax_rate, tax_inclusive, platform_fee_amount, service_fee_amount, platform_fee_paid_by, service_fee_paid_by,
    currency, payment_status, tenant_id, booking_source, commission_percentage_snapshot)
VALUES ('60000000-0000-4000-8000-000000000053', 'AUD-excl-ok',
    '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001',
    'confirmed', 'at_salon', now() + interval '1 day',
    100.00, 115.00, 15.00, 15, false, 0, 0, 'customer', 'customer',
    'ZAR', 'pending', '10000000-0000-4000-8000-000000000001', 'online', 15);
SELECT pg_temp.audit_assert(
  EXISTS (SELECT 1 FROM public.bookings WHERE id = '60000000-0000-4000-8000-000000000053' AND total_amount = 115.00),
  'F2-13 tax-exclusive total accepted when tax_inclusive is false'
);

-- =============================================================================
-- F2-04  duplicate PayCloud notify rejected; Yoco webhook_id unique (10138)
-- =============================================================================
INSERT INTO public.paycloud_webhook_events (merchant_order_no, event_type, signature_valid, payload)
VALUES ('AUD-PC-1', 'SUCCESS', true, '{}'::jsonb);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.paycloud_webhook_events (merchant_order_no, event_type, signature_valid, payload)
    VALUES ('AUD-PC-1', 'SUCCESS', true, '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: F2-04 duplicate PayCloud webhook accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-04 duplicate PayCloud (merchant_order_no, event_type) rejected');
  END;
END $$;

INSERT INTO public.paycloud_webhook_events (merchant_order_no, event_type, signature_valid, payload)
VALUES ('AUD-PC-1', 'CLOSED', true, '{}'::jsonb);
SELECT pg_temp.audit_assert(true, 'F2-04 later PayCloud status for same order still insertable');

INSERT INTO public.provider_yoco_webhook_events (webhook_id, event_type, payload)
VALUES ('aud-yoco-wh-1', 'payment.succeeded', '{}'::jsonb);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.provider_yoco_webhook_events (webhook_id, event_type, payload)
    VALUES ('aud-yoco-wh-1', 'payment.succeeded', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: F2-04 duplicate Yoco webhook_id accepted';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.audit_assert(true, 'F2-04 duplicate Yoco webhook_id rejected');
  END;
END $$;

-- =============================================================================
-- F2-46  past_due within 3-day grace is entitled on both RPCs
-- =============================================================================
INSERT INTO public.subscription_plans (id, name, slug, price_monthly, is_free, is_active, features, max_bookings_per_month)
VALUES (
  'a1000000-0000-4000-8000-000000000050',
  'Audit Paid',
  'audit-paid-tier-10142',
  99,
  false,
  true,
  '{"booking_online": true, "advanced_analytics": true}'::jsonb,
  500
)
ON CONFLICT (id) DO UPDATE SET features = EXCLUDED.features, is_free = false, is_active = true;

DELETE FROM public.provider_subscriptions
 WHERE provider_id = '30000000-0000-4000-8000-000000000001';
INSERT INTO public.provider_subscriptions (provider_id, plan_id, status, started_at, expires_at, updated_at, tenant_id)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000050',
  'past_due',
  now() - interval '40 days',
  now() + interval '20 days',
  now() - interval '1 day',
  '10000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_plan uuid;
  v_tier uuid;
  v_access boolean;
BEGIN
  SELECT plan_id INTO v_plan FROM public.get_provider_subscription_plan('30000000-0000-4000-8000-000000000001');
  SELECT plan_id INTO v_tier FROM public.get_provider_subscription_tier('30000000-0000-4000-8000-000000000001');
  v_access := public.provider_has_feature_access('30000000-0000-4000-8000-000000000001', 'advanced_analytics');
  PERFORM pg_temp.audit_assert(v_plan = 'a1000000-0000-4000-8000-000000000050', 'F2-46 plan RPC keeps past_due within grace');
  PERFORM pg_temp.audit_assert(v_tier = v_plan, 'F2-46 tier RPC matches plan RPC on grace');
  PERFORM pg_temp.audit_assert(v_access IS TRUE, 'F2-46 feature access uses paid plan during grace');
END $$;

ROLLBACK;
