-- Split app_version_settings by native app: customer vs provider (composite PK app + platform).

ALTER TABLE public.app_version_settings ADD COLUMN IF NOT EXISTS app TEXT;

UPDATE public.app_version_settings SET app = 'customer' WHERE app IS NULL;

ALTER TABLE public.app_version_settings DROP CONSTRAINT IF EXISTS app_version_settings_app_check;
ALTER TABLE public.app_version_settings
  ADD CONSTRAINT app_version_settings_app_check
  CHECK (app IN ('customer', 'provider'));

ALTER TABLE public.app_version_settings ALTER COLUMN app SET NOT NULL;
ALTER TABLE public.app_version_settings ALTER COLUMN app SET DEFAULT 'customer';

ALTER TABLE public.app_version_settings DROP CONSTRAINT IF EXISTS app_version_settings_pkey;

ALTER TABLE public.app_version_settings ADD PRIMARY KEY (app, platform);

INSERT INTO public.app_version_settings (app, platform, min_version, latest_version, force_update, update_url)
SELECT 'provider', s.platform, s.min_version, s.latest_version, s.force_update, s.update_url
FROM public.app_version_settings s
WHERE s.app = 'customer'
ON CONFLICT (app, platform) DO NOTHING;

COMMENT ON TABLE public.app_version_settings IS 'Per app (customer|provider) and platform (ios|android): min/latest version, force flag, store URL for native update prompts.';
