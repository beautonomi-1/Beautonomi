-- Migration 524 copied customer Play Store URLs onto provider rows.
UPDATE public.app_version_settings
SET update_url = 'https://play.google.com/store/apps/details?id=com.beautonomi.partner'
WHERE app = 'provider'
  AND platform = 'android'
  AND update_url = 'https://play.google.com/store/apps/details?id=com.beautonomi';
