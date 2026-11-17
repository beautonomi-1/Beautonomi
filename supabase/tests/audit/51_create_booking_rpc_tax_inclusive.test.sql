-- Tests for 10143_create_booking_rpc_tax_inclusive.sql
-- Run: node supabase/tests/audit/run.mjs --docker beautonomi-audit-db
\set ON_ERROR_STOP on
BEGIN;
\ir 00_fixture.sql

-- Exclusive totals on the RPC insert (no follow-up UPDATE) when tax_inclusive is false.
DO $audit$
DECLARE
  v_id uuid;
  v_start timestamptz := timestamptz '2030-01-15 09:00:00+00';
  v_end timestamptz := timestamptz '2030-01-15 10:00:00+00';
  v_tax_incl boolean;
  v_tax_rate numeric;
  v_total numeric;
  v_vat_snap text;
  v_fee numeric;
  v_source text;
BEGIN
  v_id := public.create_booking_with_locking(
    jsonb_build_object(
      'customer_id', '20000000-0000-4000-8000-000000000003',
      'provider_id', '30000000-0000-4000-8000-000000000001',
      'status', 'pending',
      'location_type', 'at_salon',
      'scheduled_at', v_start,
      'subtotal', 100,
      'tax_amount', 15,
      'tax_rate', 15,
      'tax_inclusive', false,
      'total_amount', 115,
      'currency', 'ZAR',
      'payment_status', 'pending',
      'platform_fee_amount', 0,
      'service_fee_amount', 0,
      'booking_source', 'provider',
      'tenant_id', '10000000-0000-4000-8000-000000000001',
      'provider_vat_number_snapshot', '4123456789'
    ),
    ARRAY[
      jsonb_build_object(
        'offering_id', '50000000-0000-4000-8000-000000000001',
        'staff_id', '40000000-0000-4000-8000-000000000002',
        'duration_minutes', 60,
        'price', 100,
        'currency', 'ZAR',
        'scheduled_start_at', v_start,
        'scheduled_end_at', v_end
      )
    ],
    '40000000-0000-4000-8000-000000000002'::uuid,
    v_start,
    v_end
  );

  SELECT tax_inclusive, tax_rate, total_amount, provider_vat_number_snapshot, platform_fee_amount, booking_source
    INTO v_tax_incl, v_tax_rate, v_total, v_vat_snap, v_fee, v_source
  FROM public.bookings WHERE id = v_id;

  PERFORM pg_temp.audit_assert(v_id IS NOT NULL, '10143 RPC returns booking id');
  PERFORM pg_temp.audit_assert(v_tax_incl IS FALSE, '10143 RPC persists tax_inclusive=false');
  PERFORM pg_temp.audit_assert(v_tax_rate = 15, '10143 RPC persists tax_rate');
  PERFORM pg_temp.audit_assert(v_total = 115, '10143 exclusive total accepted on insert');
  PERFORM pg_temp.audit_assert(v_vat_snap = '4123456789', '10143 RPC persists VAT snapshot');
  PERFORM pg_temp.audit_assert(v_fee = 0, '10143 RPC persists platform_fee_amount');
  PERFORM pg_temp.audit_assert(v_source = 'provider', '10143 RPC persists booking_source');
END
$audit$;

-- Missing tax_inclusive still defaults inclusive, so exclusive totals fail on insert.
DO $audit$
DECLARE
  v_start timestamptz := timestamptz '2030-01-16 09:00:00+00';
  v_end timestamptz := timestamptz '2030-01-16 10:00:00+00';
BEGIN
  BEGIN
    PERFORM public.create_booking_with_locking(
      jsonb_build_object(
        'customer_id', '20000000-0000-4000-8000-000000000003',
        'provider_id', '30000000-0000-4000-8000-000000000001',
        'status', 'pending',
        'location_type', 'at_salon',
        'scheduled_at', v_start,
        'subtotal', 100,
        'tax_amount', 15,
        'tax_rate', 15,
        'total_amount', 115,
        'currency', 'ZAR',
        'payment_status', 'pending',
        'platform_fee_amount', 0,
        'service_fee_amount', 0
      ),
      ARRAY[
        jsonb_build_object(
          'offering_id', '50000000-0000-4000-8000-000000000001',
          'staff_id', '40000000-0000-4000-8000-000000000002',
          'duration_minutes', 60,
          'price', 100,
          'currency', 'ZAR',
          'scheduled_start_at', v_start,
          'scheduled_end_at', v_end
        )
      ],
      '40000000-0000-4000-8000-000000000002'::uuid,
      v_start,
      v_end
    );
    RAISE EXCEPTION 'FAIL: 10143 exclusive total accepted without tax_inclusive';
  EXCEPTION
    WHEN check_violation THEN
      PERFORM pg_temp.audit_assert(
        SQLERRM LIKE '%Total amount validation failed%',
        '10143 missing tax_inclusive still defaults inclusive'
      );
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Total amount validation failed%' THEN
        PERFORM pg_temp.audit_assert(true, '10143 missing tax_inclusive still defaults inclusive');
      ELSE
        RAISE;
      END IF;
  END;
END
$audit$;

ROLLBACK;
