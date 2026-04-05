-- Paystack TEST keys for local/staging (Paystack dashboard → Settings → API Keys → Test Mode).
-- Application reads: region_secrets.paystack_secret_key (getPaystackSecretKey) and
-- region_settings.settings.paystack_public_key (config bundle → clients).
--
-- Replace with live keys before production; do not rely on this migration in prod without review.
-- Callback/webhook URLs are configured in the Paystack dashboard (e.g. point to your Next.js host).

DO $$
DECLARE
  v_region_id UUID;
  v_secret TEXT := 'sk_test_04da914ae5a19f51dd7e23f96686a6cd7da1b024';
  v_public TEXT := 'pk_test_69dc6b286a888b3dfe62765229a5d43b7b0c75df';
  v_updated int;
BEGIN
  SELECT id INTO v_region_id FROM public.regions WHERE code = 'ZA' AND is_active = true LIMIT 1;

  IF v_region_id IS NULL THEN
    RAISE NOTICE '403_seed_za_paystack_test_keys: ZA region row missing; skipping Paystack seed.';
    RETURN;
  END IF;

  INSERT INTO public.region_secrets (region_id, key, value_encrypted)
  VALUES (v_region_id, 'paystack_secret_key', v_secret)
  ON CONFLICT (region_id, key) DO UPDATE SET
    value_encrypted = EXCLUDED.value_encrypted,
    updated_at = now();

  INSERT INTO public.region_settings (region_id, settings, is_active)
  VALUES (
    v_region_id,
    jsonb_build_object('paystack_public_key', v_public),
    true
  )
  ON CONFLICT (region_id) DO UPDATE SET
    settings = COALESCE(public.region_settings.settings, '{}'::jsonb)
      || jsonb_build_object('paystack_public_key', v_public),
    updated_at = now();

  -- Fallback: global platform_secrets (migration 354 adds tenant_id; older DBs have a singleton row).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_secrets'
      AND column_name = 'tenant_id'
  ) THEN
    UPDATE public.platform_secrets
    SET
      paystack_secret_key = COALESCE(NULLIF(TRIM(paystack_secret_key), ''), v_secret),
      paystack_public_key = COALESCE(NULLIF(TRIM(paystack_public_key), ''), v_public),
      updated_at = now()
    WHERE tenant_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      INSERT INTO public.platform_secrets (tenant_id, paystack_secret_key, paystack_public_key)
      VALUES (NULL, v_secret, v_public);
    END IF;
  ELSE
    UPDATE public.platform_secrets
    SET
      paystack_secret_key = COALESCE(NULLIF(TRIM(paystack_secret_key), ''), v_secret),
      paystack_public_key = COALESCE(NULLIF(TRIM(paystack_public_key), ''), v_public),
      updated_at = now();

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      INSERT INTO public.platform_secrets (paystack_secret_key, paystack_public_key)
      VALUES (v_secret, v_public);
    END IF;
  END IF;
END $$;
