-- Beautonomi Database Migration
-- 019_migrate_existing_secrets.sql
-- One-time data migration:
-- - Copy secrets from older storage locations into platform_secrets
-- - Scrub secrets from publicly readable tables (platform_settings, mapbox_config)

DO $$
DECLARE
  v_settings JSONB;
  v_paystack_secret TEXT;
  v_paystack_public TEXT;
  v_paystack_webhook TEXT;
  v_onesignal_rest TEXT;
  v_mapbox_access TEXT;
  v_amplitude_secret TEXT;
  v_mapbox_config_access TEXT;
BEGIN
  -- Ensure platform_secrets singleton exists
  IF NOT EXISTS (SELECT 1 FROM public.platform_secrets) THEN
    INSERT INTO public.platform_secrets DEFAULT VALUES;
  END IF;

  -- Load platform_settings.settings (if present)
  SELECT settings INTO v_settings
  FROM public.platform_settings
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_settings IS NOT NULL THEN
    v_paystack_secret := NULLIF(v_settings #>> '{paystack,secret_key}', '');
    v_paystack_public := NULLIF(v_settings #>> '{paystack,public_key}', '');
    v_paystack_webhook := NULLIF(v_settings #>> '{paystack,webhook_secret}', '');
    v_onesignal_rest := NULLIF(v_settings #>> '{onesignal,rest_api_key}', '');
    v_mapbox_access := NULLIF(v_settings #>> '{mapbox,access_token}', '');
    v_amplitude_secret := NULLIF(v_settings #>> '{amplitude,secret_key}', '');

    -- Upsert into platform_secrets without overwriting existing values
    UPDATE public.platform_secrets
    SET
      paystack_secret_key = COALESCE(paystack_secret_key, v_paystack_secret),
      paystack_public_key = COALESCE(paystack_public_key, v_paystack_public),
      paystack_webhook_secret = COALESCE(paystack_webhook_secret, v_paystack_webhook),
      onesignal_rest_api_key = COALESCE(onesignal_rest_api_key, v_onesignal_rest),
      mapbox_access_token = COALESCE(mapbox_access_token, v_mapbox_access),
      amplitude_secret_key = COALESCE(amplitude_secret_key, v_amplitude_secret),
      updated_at = NOW();

    -- Scrub secrets from platform_settings.settings (keep structure; blank values)
    UPDATE public.platform_settings
    SET settings =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  settings,
                  '{paystack,secret_key}',
                  to_jsonb(''::text),
                  true
                ),
                '{paystack,public_key}',
                to_jsonb(''::text),
                true
              ),
              '{paystack,webhook_secret}',
              to_jsonb(''::text),
              true
            ),
            '{onesignal,rest_api_key}',
            to_jsonb(''::text),
            true
          ),
          '{mapbox,access_token}',
          to_jsonb(''::text),
          true
        ),
        '{amplitude,secret_key}',
        to_jsonb(''::text),
        true
      ),
      updated_at = NOW()
    WHERE is_active = true;
  END IF;

  -- If mapbox_config table exists, migrate its access_token too
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'mapbox_config'
  ) THEN
    BEGIN
      EXECUTE 'SELECT access_token FROM public.mapbox_config WHERE is_enabled = true ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1'
      INTO v_mapbox_config_access;

      IF v_mapbox_config_access IS NOT NULL AND v_mapbox_config_access <> '' THEN
        UPDATE public.platform_secrets
        SET
          mapbox_access_token = COALESCE(mapbox_access_token, v_mapbox_config_access),
          updated_at = NOW();
      END IF;

      -- Scrub secret from mapbox_config (keep public_access_token for client usage)
      EXECUTE 'UPDATE public.mapbox_config SET access_token = NULL, updated_at = NOW()';
    EXCEPTION WHEN undefined_column THEN
      -- Older/other schema: ignore if access_token column doesn't exist
      NULL;
    END;
  END IF;
END $$;

