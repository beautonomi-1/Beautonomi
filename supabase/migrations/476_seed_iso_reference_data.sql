-- Seed baseline ISO reference rows for admin /iso-codes and platform defaults.
-- Depends on: 061_iso_codes_tables, 289_seed_iso_languages (en, af, zu, …).
-- Safe to re-run: ON CONFLICT DO NOTHING.

INSERT INTO public.iso_countries (code, code3, numeric_code, name, phone_country_code, is_active, is_default)
VALUES
  ('ZA', 'ZAF', '710', 'South Africa', '+27', true, true),
  ('US', 'USA', '840', 'United States', '+1', true, false),
  ('GB', 'GBR', '826', 'United Kingdom', '+44', true, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.iso_currencies (code, name, symbol, decimal_places, is_active, is_default)
VALUES
  ('ZAR', 'South African Rand', 'R', 2, true, true),
  ('USD', 'US Dollar', '$', 2, true, false)
ON CONFLICT (code) DO NOTHING;

-- Locales reference iso_languages + iso_countries
INSERT INTO public.iso_locales (code, language_code, country_code, name, is_active, is_default)
VALUES
  ('en-ZA', 'en', 'ZA', 'English (South Africa)', true, true),
  ('af-ZA', 'af', 'ZA', 'Afrikaans (South Africa)', true, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.iso_timezones (code, name, utc_offset, country_code, is_active, is_default)
VALUES
  ('Africa/Johannesburg', 'South Africa Standard Time', '+02:00', 'ZA', true, true)
ON CONFLICT (code) DO NOTHING;
