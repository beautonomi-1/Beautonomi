-- 185_add_footer_links_for_pages.sql
-- Add footer links for public pages that should be managed via CMS

DO $$
DECLARE
  max_about_order integer;
  max_business_order integer;
BEGIN
  -- Get max display_order for each section
  SELECT COALESCE(MAX(display_order), 0) INTO max_about_order
  FROM footer_links
  WHERE section = 'about';

  SELECT COALESCE(MAX(display_order), 0) INTO max_business_order
  FROM footer_links
  WHERE section = 'business';

  -- Add pages to "About Beautonomi" section
  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'about', 'Help Center', '/help', max_about_order + 1, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/help' AND section = 'about');

  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'about', 'About', '/about', max_about_order + 2, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/about' AND section = 'about');

  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'about', 'Gift Cards', '/gift-card', max_about_order + 3, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/gift-card' AND section = 'about');

  -- Add pages to "For Business" section
  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'business', 'Become a Partner', '/become-a-partner', max_business_order + 1, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/become-a-partner' AND section = 'business');

  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'business', 'Pricing', '/pricing', max_business_order + 2, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/pricing' AND section = 'business');

  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'business', 'Gift Card Purchase', '/gift-card/purchase', max_business_order + 3, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/gift-card/purchase' AND section = 'business');

  -- Add signup to "About Beautonomi" section
  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'about', 'Sign Up', '/signup', max_about_order + 4, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE href = '/signup' AND section = 'about');

  RAISE NOTICE 'Footer links added for public pages';
END $$;
