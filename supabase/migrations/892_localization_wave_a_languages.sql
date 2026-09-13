-- Wave A localization: ISO languages, preference_options, feature flag.
-- Safe to re-run.

INSERT INTO public.iso_languages (code, name, native_name, is_active, is_default, rtl)
VALUES
  ('fr', 'French', 'Français', true, false, false),
  ('ar', 'Arabic', 'العربية', true, false, true),
  ('sw', 'Swahili', 'Kiswahili', true, false, false),
  ('pt', 'Portuguese', 'Português', true, false, false),
  ('es', 'Spanish', 'Español', true, false, false),
  ('de', 'German', 'Deutsch', true, false, false),
  ('hi', 'Hindi', 'हिन्दी', true, false, false),
  ('id', 'Indonesian', 'Bahasa Indonesia', true, false, false),
  ('tr', 'Turkish', 'Türkçe', true, false, false),
  ('am', 'Amharic', 'አማርኛ', true, false, false),
  ('rw', 'Kinyarwanda', 'Ikinyarwanda', true, false, false),
  ('nl', 'Dutch', 'Nederlands', true, false, false),
  ('it', 'Italian', 'Italiano', true, false, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  native_name = EXCLUDED.native_name,
  rtl = EXCLUDED.rtl,
  is_active = true;

INSERT INTO public.preference_options (type, code, name, display_order, is_active)
SELECT v.type, v.code, v.name, v.display_order, true
FROM (VALUES
  ('language', 'fr', 'Français (French)', 200),
  ('language', 'ar', 'العربية (Arabic)', 201),
  ('language', 'sw', 'Kiswahili (Swahili)', 202),
  ('language', 'pt', 'Português (Portuguese)', 203),
  ('language', 'pt-BR', 'Português (Brasil)', 204),
  ('language', 'es', 'Español (Spanish)', 205),
  ('language', 'es-MX', 'Español (México)', 206),
  ('language', 'en-GB', 'English (UK)', 207),
  ('language', 'en-US', 'English (US)', 208),
  ('language', 'en-AU', 'English (Australia)', 209),
  ('language', 'de', 'Deutsch (German)', 210)
) AS v(type, code, name, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.preference_options po
  WHERE po.type = v.type AND po.code = v.code AND po.tenant_id IS NULL
);

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
VALUES (
  'languages.enabled',
  'Multi-language UI',
  'When enabled, language picker and bundled translations are active for customer/provider/web consumer surfaces.',
  true,
  'localization'
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category;
