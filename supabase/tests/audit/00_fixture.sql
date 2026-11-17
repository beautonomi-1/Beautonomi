-- Synthetic fixture shared by supabase/tests/audit/*.test.sql.
-- Included with \ir from each test inside an open transaction; every test ends
-- with ROLLBACK so nothing persists. All identifiers are fixed, non-real values.
-- NO real personal data: *.example.invalid addresses, +2700000000x numbers.

INSERT INTO public.tenants (id, slug, name, region_code, default_currency, default_timezone)
VALUES ('10000000-0000-4000-8000-000000000001','audit-za','Audit Tenant','ZA','ZAR','Africa/Johannesburg')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
 ('20000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-owner@example.invalid','x','{"provider":"email"}','{"full_name":"Audit Owner"}',now(),now()),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-staff@example.invalid','x','{"provider":"email"}','{"full_name":"Audit Staff"}',now(),now()),
 ('20000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-customer@example.invalid','x','{"provider":"email"}','{"full_name":"Audit Customer"}',now(),now()),
 ('20000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','audit-customer-b@example.invalid','x','{"provider":"email"}','{"full_name":"Audit Customer B"}',now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role, referral_code, phone)
VALUES
 ('20000000-0000-4000-8000-000000000001','audit-owner@example.invalid','Audit Owner','provider_owner','AUDIT001','+27000000001'),
 ('20000000-0000-4000-8000-000000000002','audit-staff@example.invalid','Audit Staff','provider_staff','AUDIT002','+27000000002'),
 ('20000000-0000-4000-8000-000000000003','audit-customer@example.invalid','Audit Customer','customer','AUDIT003','+27000000003'),
 ('20000000-0000-4000-8000-000000000004','audit-customer-b@example.invalid','Audit Customer B','customer','AUDIT004','+27000000004')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.providers (id, user_id, business_name, business_type, slug, tenant_id, commission_override, status)
VALUES ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Audit Salon','salon','audit-salon','10000000-0000-4000-8000-000000000001', 15, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.provider_staff (id, provider_id, user_id, name, email, role, is_active, permissions)
VALUES
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Audit Owner','audit-owner@example.invalid','owner',true,'{}'),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Audit Staff','audit-staff@example.invalid','employee',true,'{"view_calendar":true}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.offerings (id, provider_id, title, duration_minutes, price, is_active)
VALUES ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Audit Cut',60,318.33,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.gift_cards (id, code, currency, initial_balance, balance, is_active, tenant_id)
VALUES ('90000000-0000-4000-8000-000000000001','AUDIT-GC-0001','ZAR',200.00,200.00,true,'10000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;
UPDATE public.gift_cards SET balance = 200.00, is_active = true, expires_at = NULL WHERE code = 'AUDIT-GC-0001';

-- Helpers ---------------------------------------------------------------------

-- Creates a booking for the audit customer. Worked example A from audit/02-money-flows.md:
-- services 318.33 VAT-inclusive + platform fee 15.00 = 333.33, tax 41.52.
CREATE OR REPLACE FUNCTION pg_temp.audit_booking(p_id uuid, p_source text DEFAULT 'online', p_customer uuid DEFAULT '20000000-0000-4000-8000-000000000003')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.bookings (id, booking_number, customer_id, provider_id, status, location_type, scheduled_at,
      subtotal, total_amount, tax_amount, tax_rate, tax_inclusive, platform_fee_amount, service_fee_amount, platform_fee_paid_by, service_fee_paid_by,
      currency, payment_status, tenant_id, booking_source, commission_percentage_snapshot)
  VALUES (p_id, 'AUD-'||p_id::text, p_customer, '30000000-0000-4000-8000-000000000001',
      'confirmed', 'at_salon', now() + interval '1 day',
      318.33, 333.33, 41.52, 15, true, 15.00, 15.00, 'customer', 'customer',
      'ZAR', 'pending', '10000000-0000-4000-8000-000000000001', p_source, 15);
END $$;

-- Impersonate a user for RLS / auth.uid() checks (hosted Supabase reads request.jwt.claims).
CREATE OR REPLACE FUNCTION pg_temp.audit_as(p_role text, p_uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.audit_assert(p_cond boolean, p_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', p_name;
  END IF;
  RAISE NOTICE 'PASS: %', p_name;
END $$;
