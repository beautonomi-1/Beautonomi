-- Per-locale labels for admin-created (and existing) global service categories.
-- Public UI resolution order:
--   1. bundled `web.categories.<slug>` when present
--   2. name_i18n[active language]
--   3. English `name`

ALTER TABLE public.global_service_categories
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.global_service_categories.name_i18n IS
  'Per-locale category labels keyed by BCP-47 code (en, af, de, …). Empty object falls back to name / locale files.';

UPDATE public.global_service_categories
SET name_i18n = jsonb_build_object('en', name)
WHERE (name_i18n = '{}'::jsonb OR name_i18n IS NULL)
  AND name IS NOT NULL
  AND length(trim(name)) > 0;
