-- Refresh deprecated Gemini 1.5 model IDs (retired upstream) to Gemini 2.5 equivalents.
-- Applies to DDL defaults and any stored config rows still pointing at 1.5 models.

ALTER TABLE gemini_integration_config
  ALTER COLUMN default_model SET DEFAULT 'gemini-2.5-flash-lite';

ALTER TABLE gemini_integration_config
  ALTER COLUMN allowed_models SET DEFAULT '["gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.5-pro"]'::jsonb;

UPDATE gemini_integration_config
SET default_model = CASE default_model
    WHEN 'gemini-1.5-flash' THEN 'gemini-2.5-flash-lite'
    WHEN 'gemini-1.5-flash-8b' THEN 'gemini-2.5-flash-lite'
    WHEN 'gemini-1.5-pro' THEN 'gemini-2.5-pro'
    ELSE default_model
  END,
  updated_at = NOW()
WHERE default_model LIKE 'gemini-1.5%';

UPDATE gemini_integration_config
SET allowed_models = '["gemini-2.5-flash-lite","gemini-2.5-flash","gemini-2.5-pro"]'::jsonb,
    updated_at = NOW()
WHERE allowed_models::text LIKE '%gemini-1.5%';
