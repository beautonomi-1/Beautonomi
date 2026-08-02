-- Migration 835: PayCloud UAT test integration seed (bantu / buntulink@gmail.com)
-- Wires PayCloud UAT credentials, merchant, terminal, and provider accept toggle.
-- Idempotent — safe to re-run. Skips quietly if the bantu provider row is absent.
--
-- UAT values (verified create-order against open-uat.paycloud.africa):
--   app_id wz56242bd3c170b130, merchant 322600014105, store 4226000567,
--   terminal WPHK002434000635
--
-- After applying: ensure NEXT_PUBLIC_APP_URL is HTTPS (PayCloud notify_url requirement).

DO $$
DECLARE
  v_provider_id   uuid := '0350ad64-f317-4464-9a19-6c39be1f1255';
  v_owner_user_id uuid := '11ccc539-9160-47be-b7b3-5fef986f1033';
  v_tenant_id     uuid;
  v_app_row_id    uuid;
  v_merchant_id   uuid;
  v_app_private   text := 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5Cvf6yO3QN8N5MZ7JzRjuV1v5FSrcOl4If6M/GFvBg6e2UmZN1rcTXvkXZsf4LRGyCa/CrR/Xj5FHGbFo4IsARrLDguM056rE0REuo7DFI6cvmAhb3wRl9Ik4WBB2c9xOH0h5B3SHUT+75ooDa60RyqByqDCJNeCjVpbjDJju0zJ/YQDUS3/sb6Da+5qnTfkPZnc2/aDYt7AMb/L/a9hXaII7+wLQHhk2bKFaNmDf1qsYrGc1kzcIyTWNgDjco24D7JlZ0KKH9GIB4Z/Gbq9CltMtdRRuLi7TlPuJ8qcJljEQmQf4ifLTBH1G/OOmN40Iyn5KsqA0bymHGgPrOWIrAgMBAAECggEAIXMpJq2Bx9z8ugDNSn+H3TXvi1RXPh5S90hTc0ls9Mte2ueEVNfWmmrVrnRG+8bx5vQ3UILJOcdbJLYxStskZXViRVN4zQx/4zpD1+GBR/HM/B6IjEsBWYjd8VCCEVeaYIjpKe++EeQPGGFxW3Lwg0HUxUVAGN2jcQNrHToevzUhJwintEhGSNm/QLooCcwAvgFdCNj+KexoCtoOjmZr3pgYQJXPoA4pS0UTDAsmVWNf529ZrmSxmJaqVtwDzIhKPPIeQQ/CW0p/92TfwG8HQGau7YEfk7zgwcwJIbjQOvMGwrUkdbc6NpRBO+dBsfPjHLqB/7e21uzIcX12YGF0oQKBgQD2NZj4gQJOb2E4Apkf3PHD1KFykTwdwMZ9GjJBaujirsVRXBStf+IBkUEJYKwvGW+F+aYnhAw4t3ZhAvIcAoJaNYh5VHJCnSLd9F1fborYCzG36IzJMiCzHMhOsFXFzaPY2fu6C8KqZp9wpsNxzDIRsBUkUL3eC4H1q1Peo70B8QKBgQDAZrK7WyFgqGyvzGeQE4FXhcsRWVMnzEb8ozylyx4a9IzUPpEU8YykgQK+/29ODKNRv2DPGGYgaQtfEG+WN5XmVgszSswuijrgAC/5Q+KNC6j5CWVBjougAJkjv0XXJeDkElBO9xe2aqfpP6/kOQXej5/r39vaXpxxPkpwF6tJ2wKBgBxj38i/74kl1LsFqax/6KzhJuC0GI+BvCGO1L6wWjxRVNVl3ciH14LAwhQXvqMLts1nFR63XkVn+lGDanGKZIeMZrk+4JIH1o5rcBzh/UaeO9RuD1Xf3t9ocTyJnspZRQxrTliMpJzLipUN1bmYhyl8+WMfoFUrVIgEgn5IuTGxAoGAD/V0xc2dSyMtQLe3r1+uzs+uNFYwa5CqIrJ3iVj7ukimlcRKzG3suIhq7eTKGrM5qMIzCXqAnheYdd4rI06hBGYGr854eTPGBmZ9lDNpS0G4Vk/NMk7cjfz+ttRauqnNqZ1LRAGC2gKmwtYhhNCmB/vpy+rZlZdbapk8G2gbMRkCgYEApcvvYUhptuvImSToekuATUOaA0BbKjLXEEnLECzfmaBYWquaI/VMX736ABgcIkC6i4HmPl5SJJziWP6pWJC2phMp7bQbeQebSknH8hnE3dYG5EWF6Ur8M+Gn44HgjLsKHzoXlcLt5zC9LkE3Aj2O/Vf4NvE6V3O8U8N7GnuHCD0=';
  v_gateway_pub   text := 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2m4nkQKyQAxJc8VVsz/L6qVbtDWRTBolUK8Dwhi9wH6aygA6363PVNEPM8eRI5W19ssCyfdtNFy6DRAureoYV053ETPUefEA5bHDOQnjbb9PuNEfT651v8cqwEaTptaxj2zujsWI8Ad3R50EyQHsskQWms/gv2aB36XUM4vyOIk4P1f3dxtqigH0YROEYiuwFFqsyJuNSjJzNbCmfgqlQv/+pE/pOV9MIQe0CAdD26JF10QpSssEwKgvKvnXPUynVu09cjSEipev5cLJSApKSDZxrRjSFBXrh6nzg8JK05ehkI8wdsryRUneh0PGN0PgYLP/wjKiqlgTJaItxnb/JQIDAQAB';
BEGIN
  SELECT p.tenant_id
  INTO v_tenant_id
  FROM public.providers p
  WHERE p.id = v_provider_id
     OR p.user_id = v_owner_user_id
  ORDER BY CASE WHEN p.id = v_provider_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE '835_paycloud_uat: bantu provider not found — skipping PayCloud UAT seed';
    RETURN;
  END IF;

  -- ── 1. Tenant-scoped sandbox app credentials (preferred over global fallback) ──
  INSERT INTO public.tenant_paycloud_apps (
    tenant_id,
    environment,
    app_id,
    app_rsa_private_key,
    gateway_rsa_public_key,
    api_base_url,
    is_enabled
  )
  VALUES (
    v_tenant_id,
    'sandbox',
    'wz56242bd3c170b130',
    v_app_private,
    v_gateway_pub,
    'https://open-uat.paycloud.africa',
    true
  )
  ON CONFLICT (tenant_id, environment) WHERE tenant_id IS NOT NULL
  DO UPDATE SET
    app_id = EXCLUDED.app_id,
    app_rsa_private_key = EXCLUDED.app_rsa_private_key,
    gateway_rsa_public_key = EXCLUDED.gateway_rsa_public_key,
    api_base_url = EXCLUDED.api_base_url,
    is_enabled = true,
    updated_at = now()
  RETURNING id INTO v_app_row_id;

  IF v_app_row_id IS NULL THEN
    SELECT id INTO v_app_row_id
    FROM public.tenant_paycloud_apps
    WHERE tenant_id = v_tenant_id AND environment = 'sandbox';
  END IF;

  -- Global sandbox fallback (other tenants / admin global scope)
  INSERT INTO public.tenant_paycloud_apps (
    tenant_id,
    environment,
    app_id,
    app_rsa_private_key,
    gateway_rsa_public_key,
    api_base_url,
    is_enabled
  )
  VALUES (
    NULL,
    'sandbox',
    'wz56242bd3c170b130',
    v_app_private,
    v_gateway_pub,
    'https://open-uat.paycloud.africa',
    true
  )
  ON CONFLICT (environment) WHERE tenant_id IS NULL
  DO UPDATE SET
    app_id = EXCLUDED.app_id,
    app_rsa_private_key = EXCLUDED.app_rsa_private_key,
    gateway_rsa_public_key = EXCLUDED.gateway_rsa_public_key,
    api_base_url = EXCLUDED.api_base_url,
    is_enabled = true,
    updated_at = now();

  -- ── 2. UAT merchant / store ─────────────────────────────────────────────────
  INSERT INTO public.paycloud_merchants (
    tenant_id,
    label,
    merchant_no,
    store_no,
    environment,
    paycloud_app_id,
    is_active
  )
  VALUES (
    v_tenant_id,
    'Buntu UAT Store',
    '322600014105',
    '4226000567',
    'sandbox',
    v_app_row_id,
    true
  )
  ON CONFLICT (tenant_id, merchant_no, store_no, environment)
  DO UPDATE SET
    label = EXCLUDED.label,
    paycloud_app_id = EXCLUDED.paycloud_app_id,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_merchant_id;

  IF v_merchant_id IS NULL THEN
    SELECT id INTO v_merchant_id
    FROM public.paycloud_merchants
    WHERE tenant_id = v_tenant_id
      AND merchant_no = '322600014105'
      AND store_no = '4226000567'
      AND environment = 'sandbox';
  END IF;

  -- Deactivate stale sandbox merchants (old wangtest merchant_no) for this tenant
  UPDATE public.paycloud_merchants
  SET is_active = false, updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND environment = 'sandbox'
    AND merchant_no <> '322600014105'
    AND is_active = true;

  -- ── 3. Terminal assigned to bantu provider ──────────────────────────────────
  INSERT INTO public.paycloud_terminals (
    tenant_id,
    paycloud_merchant_id,
    provider_id,
    terminal_sn,
    display_name,
    model,
    status,
    source,
    is_active,
    in_flight_payment_id,
    assigned_at
  )
  VALUES (
    v_tenant_id,
    v_merchant_id,
    v_provider_id,
    'WPHK002434000635',
    'Buntu UAT Terminal',
    'Wiseasy',
    'active',
    'admin',
    true,
    NULL,
    now()
  )
  ON CONFLICT (tenant_id, terminal_sn)
  DO UPDATE SET
    paycloud_merchant_id = EXCLUDED.paycloud_merchant_id,
    provider_id = EXCLUDED.provider_id,
    display_name = EXCLUDED.display_name,
    status = 'active',
    is_active = true,
    in_flight_payment_id = NULL,
    last_error = NULL,
    assigned_at = COALESCE(public.paycloud_terminals.assigned_at, now()),
    updated_at = now();

  -- Clear in-flight on any other terminals for this provider (stuck state → payment failed)
  UPDATE public.paycloud_terminals
  SET in_flight_payment_id = NULL, updated_at = now()
  WHERE provider_id = v_provider_id
    AND terminal_sn <> 'WPHK002434000635'
    AND in_flight_payment_id IS NOT NULL;

  -- ── 4. Provider accept toggle ───────────────────────────────────────────────
  UPDATE public.providers
  SET accept_paycloud = true, updated_at = now()
  WHERE id = v_provider_id;

  INSERT INTO public.provider_paycloud_settings (
    provider_id,
    tenant_id,
    accept_paycloud,
    qr_payments_enabled,
    cashback_enabled
  )
  VALUES (
    v_provider_id,
    v_tenant_id,
    true,
    false,
    false
  )
  ON CONFLICT (provider_id)
  DO UPDATE SET
    accept_paycloud = true,
    tenant_id = EXCLUDED.tenant_id,
    updated_at = now();

  RAISE NOTICE '835_paycloud_uat: seeded PayCloud UAT for provider % tenant %', v_provider_id, v_tenant_id;
END $$;
