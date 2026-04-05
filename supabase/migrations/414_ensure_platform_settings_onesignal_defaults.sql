-- Ensure every active platform_settings row has a settings.onesignal object so:
-- - Superadmin Platform Settings UI and validation always see the expected shape
-- - GET /api/public/third-party-config can read enabled + app_id / app_id_provider
-- Defaults merge under existing keys (existing values win over the false/'' defaults).

UPDATE public.platform_settings
SET
  settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{onesignal}',
    jsonb_build_object(
      'enabled', false,
      'app_id', ''
    ) || COALESCE(settings->'onesignal', '{}'::jsonb),
    true
  ),
  updated_at = now()
WHERE is_active = true;
