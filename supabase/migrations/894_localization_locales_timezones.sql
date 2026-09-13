-- BCP-47 locale rows and IANA timezones for Tier 1 markets.
-- Safe to re-run.

INSERT INTO public.iso_locales (code, language_code, country_code, name, is_active, is_default)
VALUES
  ('en-GB', 'en', 'GB', 'English (United Kingdom)', true, false),
  ('en-US', 'en', 'US', 'English (United States)', true, false),
  ('en-AU', 'en', 'AU', 'English (Australia)', true, false),
  ('fr-FR', 'fr', 'FR', 'French (France)', true, false),
  ('fr-CI', 'fr', 'CI', 'French (Côte d''Ivoire)', true, false),
  ('ar-AE', 'ar', 'AE', 'Arabic (UAE)', true, false),
  ('ar-SA', 'ar', 'SA', 'Arabic (Saudi Arabia)', true, false),
  ('ar-EG', 'ar', 'EG', 'Arabic (Egypt)', true, false),
  ('sw-KE', 'sw', 'KE', 'Swahili (Kenya)', true, false),
  ('pt-PT', 'pt', 'PT', 'Portuguese (Portugal)', true, false),
  ('pt-BR', 'pt', 'BR', 'Portuguese (Brazil)', true, false),
  ('es-ES', 'es', 'ES', 'Spanish (Spain)', true, false),
  ('es-MX', 'es', 'MX', 'Spanish (Mexico)', true, false),
  ('de-DE', 'de', 'DE', 'German (Germany)', true, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.iso_timezones (code, name, utc_offset, country_code, is_active, is_default)
VALUES
  ('Africa/Lagos', 'West Africa Time', '+01:00', 'NG', true, false),
  ('Africa/Nairobi', 'East Africa Time', '+03:00', 'KE', true, false),
  ('Africa/Accra', 'Ghana Mean Time', '+00:00', 'GH', true, false),
  ('Africa/Cairo', 'Egypt Standard Time', '+02:00', 'EG', true, false),
  ('Africa/Abidjan', 'Greenwich Mean Time', '+00:00', 'CI', true, false),
  ('Europe/London', 'Greenwich Mean Time', '+00:00', 'GB', true, false),
  ('America/New_York', 'Eastern Standard Time', '-05:00', 'US', true, false),
  ('Asia/Dubai', 'Gulf Standard Time', '+04:00', 'AE', true, false),
  ('Asia/Riyadh', 'Arabia Standard Time', '+03:00', 'SA', true, false),
  ('Europe/Paris', 'Central European Time', '+01:00', 'FR', true, false),
  ('Europe/Berlin', 'Central European Time', '+01:00', 'DE', true, false),
  ('Europe/Madrid', 'Central European Time', '+01:00', 'ES', true, false),
  ('Europe/Lisbon', 'Western European Time', '+00:00', 'PT', true, false),
  ('America/Sao_Paulo', 'Brasilia Time', '-03:00', 'BR', true, false),
  ('Australia/Sydney', 'Australian Eastern Time', '+10:00', 'AU', true, false)
ON CONFLICT (code) DO NOTHING;
