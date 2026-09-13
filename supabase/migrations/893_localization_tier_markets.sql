-- Tier 1 market reference data + inactive region rows (launch separately via tenant/feature flags).
-- Safe to re-run.

INSERT INTO public.iso_countries (code, code3, numeric_code, name, phone_country_code, is_active, is_default)
VALUES
  ('NG', 'NGA', '566', 'Nigeria', '+234', true, false),
  ('KE', 'KEN', '404', 'Kenya', '+254', true, false),
  ('GH', 'GHA', '288', 'Ghana', '+233', true, false),
  ('EG', 'EGY', '818', 'Egypt', '+20', true, false),
  ('CI', 'CIV', '384', 'Côte d''Ivoire', '+225', true, false),
  ('AE', 'ARE', '784', 'United Arab Emirates', '+971', true, false),
  ('SA', 'SAU', '682', 'Saudi Arabia', '+966', true, false),
  ('FR', 'FRA', '250', 'France', '+33', true, false),
  ('DE', 'DEU', '276', 'Germany', '+49', true, false),
  ('ES', 'ESP', '724', 'Spain', '+34', true, false),
  ('PT', 'PRT', '620', 'Portugal', '+351', true, false),
  ('BR', 'BRA', '076', 'Brazil', '+55', true, false),
  ('AU', 'AUS', '036', 'Australia', '+61', true, false),
  ('MX', 'MEX', '484', 'Mexico', '+52', true, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.iso_currencies (code, name, symbol, decimal_places, is_active, is_default)
VALUES
  ('NGN', 'Nigerian Naira', '₦', 2, true, false),
  ('KES', 'Kenyan Shilling', 'KSh', 2, true, false),
  ('GHS', 'Ghanaian Cedi', 'GH₵', 2, true, false),
  ('EGP', 'Egyptian Pound', 'E£', 2, true, false),
  ('XOF', 'West African CFA Franc', 'CFA', 0, true, false),
  ('AED', 'UAE Dirham', 'د.إ', 2, true, false),
  ('SAR', 'Saudi Riyal', '﷼', 2, true, false),
  ('EUR', 'Euro', '€', 2, true, false),
  ('GBP', 'British Pound', '£', 2, true, false),
  ('BRL', 'Brazilian Real', 'R$', 2, true, false),
  ('AUD', 'Australian Dollar', 'A$', 2, true, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.regions (code, name, domain, default_currency, default_language, supported_languages, timezone, is_active)
VALUES
  ('NG', 'Nigeria', 'ng.beautonomi.com', 'NGN', 'en', ARRAY['en','fr','sw'], 'Africa/Lagos', false),
  ('KE', 'Kenya', 'ke.beautonomi.com', 'KES', 'en', ARRAY['en','sw'], 'Africa/Nairobi', false),
  ('GH', 'Ghana', 'gh.beautonomi.com', 'GHS', 'en', ARRAY['en','fr'], 'Africa/Accra', false),
  ('EG', 'Egypt', 'eg.beautonomi.com', 'EGP', 'ar', ARRAY['ar','en','fr'], 'Africa/Cairo', false),
  ('CI', 'Côte d''Ivoire', 'ci.beautonomi.com', 'XOF', 'fr', ARRAY['fr','en'], 'Africa/Abidjan', false),
  ('GB', 'United Kingdom', 'beautonomi.co.uk', 'GBP', 'en-GB', ARRAY['en-GB','en','fr','ar','es','pt'], 'Europe/London', false),
  ('US', 'United States', 'beautonomi.com', 'USD', 'en-US', ARRAY['en-US','en','es','fr'], 'America/New_York', false),
  ('AE', 'United Arab Emirates', 'ae.beautonomi.com', 'AED', 'ar', ARRAY['ar','en','fr','hi'], 'Asia/Dubai', false),
  ('SA', 'Saudi Arabia', 'sa.beautonomi.com', 'SAR', 'ar', ARRAY['ar','en'], 'Asia/Riyadh', false),
  ('FR', 'France', 'fr.beautonomi.com', 'EUR', 'fr', ARRAY['fr','en','ar'], 'Europe/Paris', false),
  ('DE', 'Germany', 'de.beautonomi.com', 'EUR', 'de', ARRAY['de','en','fr','ar','tr'], 'Europe/Berlin', false),
  ('ES', 'Spain', 'es.beautonomi.com', 'EUR', 'es', ARRAY['es','en','fr','ar'], 'Europe/Madrid', false),
  ('PT', 'Portugal', 'pt.beautonomi.com', 'EUR', 'pt', ARRAY['pt','en','es','fr'], 'Europe/Lisbon', false),
  ('BR', 'Brazil', 'br.beautonomi.com', 'BRL', 'pt-BR', ARRAY['pt-BR','pt','en','es'], 'America/Sao_Paulo', false),
  ('AU', 'Australia', 'au.beautonomi.com', 'AUD', 'en-AU', ARRAY['en-AU','en'], 'Australia/Sydney', false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  default_currency = EXCLUDED.default_currency,
  default_language = EXCLUDED.default_language,
  supported_languages = EXCLUDED.supported_languages,
  timezone = EXCLUDED.timezone;
