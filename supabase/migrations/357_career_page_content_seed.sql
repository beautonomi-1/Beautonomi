-- 357_career_page_content_seed.sql
-- Default /career CMS rows (global scope). Manage in Admin -> Content, page slug "career".
-- Backward compatible: works both before and after tenant_id scope migration.

DO $$
DECLARE
  has_tenant_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'page_content'
      AND column_name = 'tenant_id'
  )
  INTO has_tenant_id;

  IF has_tenant_id THEN
    -- Update existing global rows first
    UPDATE public.page_content pc
    SET
      content_type = v.content_type,
      content = v.content,
      metadata = '{}'::jsonb,
      display_order = v.display_order,
      is_active = true,
      updated_at = now()
    FROM (
      VALUES
        ('careers_portal_url', 'text', 'https://beautonomi.zohorecruit.com/jobs/Careers', 0),
        ('meta_title', 'text', 'Careers at Beautonomi', 1),
        ('meta_description', 'text', 'Join Beautonomi. Explore open roles and help shape the future of beauty and wellness.', 2),
        ('hero_eyebrow', 'text', 'We''re hiring', 3),
        ('hero_title', 'text', 'Build with us', 4),
        ('hero_subtitle', 'text', 'Help connect people with great beauty and wellness experiences—and grow your career doing meaningful work.', 5),
        ('hero_cta_label', 'text', 'View open roles', 6),
        ('value_cards', 'json', '[{"title":"Flexibility","blurb":"Work in a way that fits your life, where regulations allow."},{"title":"Belonging","blurb":"A team where different backgrounds and ideas help us all grow."},{"title":"Impact","blurb":"Ship products millions use to book and deliver beauty services."}]', 7),
        ('highlight_cards', 'json', '[{"title":"Craft","blurb":"Design and engineering that feel effortless."},{"title":"Trust","blurb":"Safety and quality are non-negotiable."},{"title":"Momentum","blurb":"Small teams, clear goals, fast learning."}]', 8)
    ) AS v(section_key, content_type, content, display_order)
    WHERE pc.page_slug = 'career'
      AND pc.section_key = v.section_key
      AND pc.tenant_id IS NULL;

    -- Insert missing global rows
    INSERT INTO public.page_content (
      page_slug,
      section_key,
      content_type,
      content,
      metadata,
      display_order,
      is_active,
      tenant_id
    )
    SELECT
      'career',
      v.section_key,
      v.content_type,
      v.content,
      '{}'::jsonb,
      v.display_order,
      true,
      NULL
    FROM (
      VALUES
        ('careers_portal_url', 'text', 'https://beautonomi.zohorecruit.com/jobs/Careers', 0),
        ('meta_title', 'text', 'Careers at Beautonomi', 1),
        ('meta_description', 'text', 'Join Beautonomi. Explore open roles and help shape the future of beauty and wellness.', 2),
        ('hero_eyebrow', 'text', 'We''re hiring', 3),
        ('hero_title', 'text', 'Build with us', 4),
        ('hero_subtitle', 'text', 'Help connect people with great beauty and wellness experiences—and grow your career doing meaningful work.', 5),
        ('hero_cta_label', 'text', 'View open roles', 6),
        ('value_cards', 'json', '[{"title":"Flexibility","blurb":"Work in a way that fits your life, where regulations allow."},{"title":"Belonging","blurb":"A team where different backgrounds and ideas help us all grow."},{"title":"Impact","blurb":"Ship products millions use to book and deliver beauty services."}]', 7),
        ('highlight_cards', 'json', '[{"title":"Craft","blurb":"Design and engineering that feel effortless."},{"title":"Trust","blurb":"Safety and quality are non-negotiable."},{"title":"Momentum","blurb":"Small teams, clear goals, fast learning."}]', 8)
    ) AS v(section_key, content_type, content, display_order)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = 'career'
        AND pc.section_key = v.section_key
        AND pc.tenant_id IS NULL
    );
  ELSE
    -- Legacy schema path (no tenant_id column yet)
    UPDATE public.page_content pc
    SET
      content_type = v.content_type,
      content = v.content,
      metadata = '{}'::jsonb,
      display_order = v.display_order,
      is_active = true,
      updated_at = now()
    FROM (
      VALUES
        ('careers_portal_url', 'text', 'https://beautonomi.zohorecruit.com/jobs/Careers', 0),
        ('meta_title', 'text', 'Careers at Beautonomi', 1),
        ('meta_description', 'text', 'Join Beautonomi. Explore open roles and help shape the future of beauty and wellness.', 2),
        ('hero_eyebrow', 'text', 'We''re hiring', 3),
        ('hero_title', 'text', 'Build with us', 4),
        ('hero_subtitle', 'text', 'Help connect people with great beauty and wellness experiences—and grow your career doing meaningful work.', 5),
        ('hero_cta_label', 'text', 'View open roles', 6),
        ('value_cards', 'json', '[{"title":"Flexibility","blurb":"Work in a way that fits your life, where regulations allow."},{"title":"Belonging","blurb":"A team where different backgrounds and ideas help us all grow."},{"title":"Impact","blurb":"Ship products millions use to book and deliver beauty services."}]', 7),
        ('highlight_cards', 'json', '[{"title":"Craft","blurb":"Design and engineering that feel effortless."},{"title":"Trust","blurb":"Safety and quality are non-negotiable."},{"title":"Momentum","blurb":"Small teams, clear goals, fast learning."}]', 8)
    ) AS v(section_key, content_type, content, display_order)
    WHERE pc.page_slug = 'career'
      AND pc.section_key = v.section_key;

    INSERT INTO public.page_content (
      page_slug,
      section_key,
      content_type,
      content,
      metadata,
      display_order,
      is_active
    )
    SELECT
      'career',
      v.section_key,
      v.content_type,
      v.content,
      '{}'::jsonb,
      v.display_order,
      true
    FROM (
      VALUES
        ('careers_portal_url', 'text', 'https://beautonomi.zohorecruit.com/jobs/Careers', 0),
        ('meta_title', 'text', 'Careers at Beautonomi', 1),
        ('meta_description', 'text', 'Join Beautonomi. Explore open roles and help shape the future of beauty and wellness.', 2),
        ('hero_eyebrow', 'text', 'We''re hiring', 3),
        ('hero_title', 'text', 'Build with us', 4),
        ('hero_subtitle', 'text', 'Help connect people with great beauty and wellness experiences—and grow your career doing meaningful work.', 5),
        ('hero_cta_label', 'text', 'View open roles', 6),
        ('value_cards', 'json', '[{"title":"Flexibility","blurb":"Work in a way that fits your life, where regulations allow."},{"title":"Belonging","blurb":"A team where different backgrounds and ideas help us all grow."},{"title":"Impact","blurb":"Ship products millions use to book and deliver beauty services."}]', 7),
        ('highlight_cards', 'json', '[{"title":"Craft","blurb":"Design and engineering that feel effortless."},{"title":"Trust","blurb":"Safety and quality are non-negotiable."},{"title":"Momentum","blurb":"Small teams, clear goals, fast learning."}]', 8)
    ) AS v(section_key, content_type, content, display_order)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.page_content pc
      WHERE pc.page_slug = 'career'
        AND pc.section_key = v.section_key
    );
  END IF;
END $$;
