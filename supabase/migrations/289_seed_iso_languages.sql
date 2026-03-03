-- Seed iso_languages with platform languages (ISO 639-1 two-letter codes only)
-- Safe to run: ON CONFLICT DO NOTHING so existing rows are left as-is.

INSERT INTO public.iso_languages (code, name, native_name, is_active, is_default, rtl)
VALUES
  ('en', 'English', 'English', true, true, false),
  ('af', 'Afrikaans', 'Afrikaans', true, false, false),
  ('zu', 'Zulu', 'isiZulu', true, false, false),
  ('st', 'Sesotho', 'Sesotho', true, false, false),
  ('xh', 'Xhosa', 'isiXhosa', true, false, false),
  ('tn', 'Tswana', 'Setswana', true, false, false),
  ('ts', 'Tsonga', 'Xitsonga', true, false, false),
  ('ve', 'Venda', 'Tshivenḓa', true, false, false),
  ('ss', 'Swati', 'SiSwati', true, false, false)
ON CONFLICT (code) DO NOTHING;
