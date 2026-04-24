-- Native app force-update / store metadata (base table; per-app split in 524_app_version_settings_per_app.sql).
-- Admin UI: /admin/settings/app-version → /api/admin/app-version (uses service role; RLS allows public read only).

CREATE TABLE IF NOT EXISTS public.app_version_settings (
  platform TEXT PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  min_version TEXT NOT NULL DEFAULT '1.0.0',
  latest_version TEXT NOT NULL DEFAULT '1.0.0',
  force_update BOOLEAN NOT NULL DEFAULT false,
  update_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.app_version_settings IS 'Per-platform (ios/android) min/latest version, force flag, and store URL for mobile app update prompts.';

DROP TRIGGER IF EXISTS update_app_version_settings_updated_at ON public.app_version_settings;
CREATE TRIGGER update_app_version_settings_updated_at
  BEFORE UPDATE ON public.app_version_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.app_version_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app version settings" ON public.app_version_settings;
CREATE POLICY "Anyone can read app version settings"
  ON public.app_version_settings
  FOR SELECT
  USING (true);

-- Writes go through Next.js with service role (bypasses RLS). No INSERT/UPDATE policies for JWT roles.

INSERT INTO public.app_version_settings (platform, min_version, latest_version, force_update, update_url)
VALUES
  (
    'ios',
    '1.0.0',
    '1.0.0',
    false,
    'https://apps.apple.com/app/beautonomi'
  ),
  (
    'android',
    '1.0.0',
    '1.0.0',
    false,
    'https://play.google.com/store/apps/details?id=com.beautonomi'
  )
ON CONFLICT (platform) DO NOTHING;

GRANT SELECT ON public.app_version_settings TO anon, authenticated;
