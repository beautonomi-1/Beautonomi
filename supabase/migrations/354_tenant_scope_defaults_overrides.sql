-- 354_tenant_scope_defaults_overrides.sql
-- Global default + optional per-tenant overrides for website customization.
-- Non-breaking strategy: tenant_id nullable; existing rows remain global defaults (tenant_id IS NULL).

-- Core settings/secrets
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.platform_secrets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- CMS / website content
ALTER TABLE public.page_content ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.faqs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.featured_cities ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.footer_links ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.footer_app_links ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.footer_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.about_us_content ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.profile_questions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.preference_options ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.learning_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.learning_articles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.learning_homepage_sections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Templates
ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.sms_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Generic scope indexes
CREATE INDEX IF NOT EXISTS idx_platform_settings_tenant_id ON public.platform_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_secrets_tenant_id ON public.platform_secrets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_page_content_tenant_id ON public.page_content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_faqs_tenant_id ON public.faqs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_resources_tenant_id ON public.resources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_featured_cities_tenant_id ON public.featured_cities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_footer_links_tenant_id ON public.footer_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_footer_app_links_tenant_id ON public.footer_app_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_footer_settings_tenant_id ON public.footer_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_about_us_content_tenant_id ON public.about_us_content(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profile_questions_tenant_id ON public.profile_questions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_preference_options_tenant_id ON public.preference_options(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_categories_tenant_id ON public.learning_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_articles_tenant_id ON public.learning_articles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_homepage_sections_tenant_id ON public.learning_homepage_sections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant_id ON public.notification_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON public.email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_tenant_id ON public.sms_templates(tenant_id);

-- platform_secrets singleton model -> scoped model
DROP INDEX IF EXISTS public.uniq_platform_secrets_singleton;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_secrets_global_default
  ON public.platform_secrets((1))
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_secrets_per_tenant
  ON public.platform_secrets(tenant_id)
  WHERE tenant_id IS NOT NULL;

-- page_content uniqueness by scope
ALTER TABLE public.page_content DROP CONSTRAINT IF EXISTS page_content_page_slug_section_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_page_content_global
  ON public.page_content(page_slug, section_key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_page_content_tenant
  ON public.page_content(tenant_id, page_slug, section_key)
  WHERE tenant_id IS NOT NULL;

-- resources: migration 070 replaced CMS help-articles `resources(slug)` with provider rooms/equipment
-- (no slug). Only apply slug-scoped uniqueness when that legacy column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resources'
      AND column_name = 'slug'
  ) THEN
    ALTER TABLE public.resources DROP CONSTRAINT IF EXISTS resources_slug_key;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_resources_global_slug
      ON public.resources(slug)
      WHERE tenant_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_resources_tenant_slug
      ON public.resources(tenant_id, slug)
      WHERE tenant_id IS NOT NULL;
  END IF;
END $$;

-- featured_cities uniqueness by scope
ALTER TABLE public.featured_cities DROP CONSTRAINT IF EXISTS featured_cities_country_code_city_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_featured_cities_global
  ON public.featured_cities(country_code, city_code)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_featured_cities_tenant
  ON public.featured_cities(tenant_id, country_code, city_code)
  WHERE tenant_id IS NOT NULL;

-- footer links/app links/settings uniqueness by scope
ALTER TABLE public.footer_links DROP CONSTRAINT IF EXISTS footer_links_section_title_href_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_footer_links_global
  ON public.footer_links(section, title, href)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_footer_links_tenant
  ON public.footer_links(tenant_id, section, title, href)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.footer_app_links DROP CONSTRAINT IF EXISTS footer_app_links_platform_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_footer_app_links_global
  ON public.footer_app_links(platform)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_footer_app_links_tenant
  ON public.footer_app_links(tenant_id, platform)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.footer_settings DROP CONSTRAINT IF EXISTS footer_settings_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_footer_settings_global
  ON public.footer_settings(key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_footer_settings_tenant
  ON public.footer_settings(tenant_id, key)
  WHERE tenant_id IS NOT NULL;

-- about us, profile questions, preference options uniqueness by scope
ALTER TABLE public.about_us_content DROP CONSTRAINT IF EXISTS about_us_content_section_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_about_us_content_global
  ON public.about_us_content(section_key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_about_us_content_tenant
  ON public.about_us_content(tenant_id, section_key)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.profile_questions DROP CONSTRAINT IF EXISTS profile_questions_question_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profile_questions_global
  ON public.profile_questions(question_key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_profile_questions_tenant
  ON public.profile_questions(tenant_id, question_key)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.preference_options DROP CONSTRAINT IF EXISTS preference_options_type_code_key;
ALTER TABLE public.preference_options DROP CONSTRAINT IF EXISTS preference_options_type_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_preference_options_global_type_code
  ON public.preference_options(type, code)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_preference_options_tenant_type_code
  ON public.preference_options(tenant_id, type, code)
  WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_preference_options_global_type_name
  ON public.preference_options(type, name)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_preference_options_tenant_type_name
  ON public.preference_options(tenant_id, type, name)
  WHERE tenant_id IS NOT NULL;

-- learning center uniqueness by scope
ALTER TABLE public.learning_categories DROP CONSTRAINT IF EXISTS learning_categories_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_categories_global_slug
  ON public.learning_categories(slug)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_categories_tenant_slug
  ON public.learning_categories(tenant_id, slug)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.learning_articles DROP CONSTRAINT IF EXISTS learning_articles_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_articles_global_slug
  ON public.learning_articles(slug)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_articles_tenant_slug
  ON public.learning_articles(tenant_id, slug)
  WHERE tenant_id IS NOT NULL;

ALTER TABLE public.learning_homepage_sections DROP CONSTRAINT IF EXISTS learning_homepage_sections_section_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_homepage_sections_global
  ON public.learning_homepage_sections(section_key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_homepage_sections_tenant
  ON public.learning_homepage_sections(tenant_id, section_key)
  WHERE tenant_id IS NOT NULL;

-- templates uniqueness by scope
ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_templates_global
  ON public.notification_templates(key)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notification_templates_tenant
  ON public.notification_templates(tenant_id, key)
  WHERE tenant_id IS NOT NULL;

-- Email/SMS templates were historically not keyed globally.
-- For override semantics (global default + tenant optional override), key by name.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_templates_global_name
  ON public.email_templates(name)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_templates_tenant_name
  ON public.email_templates(tenant_id, name)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_templates_global_name
  ON public.sms_templates(name)
  WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_templates_tenant_name
  ON public.sms_templates(tenant_id, name)
  WHERE tenant_id IS NOT NULL;
