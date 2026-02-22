-- 186_fix_footer_business_links.sql
-- Fix incorrect URLs for footer business section links

DO $$
DECLARE
  max_business_order integer;
BEGIN
  -- Get max display_order for business section
  SELECT COALESCE(MAX(display_order), 0) INTO max_business_order
  FROM footer_links
  WHERE section = 'business';

  -- Fix "Pricing" link - should point to /pricing, not /resources
  UPDATE footer_links
  SET href = '/pricing',
      updated_at = NOW()
  WHERE section = 'business'
    AND title = 'Pricing'
    AND href != '/pricing';

  -- If Pricing link doesn't exist, create it
  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'business', 'Pricing', '/pricing', max_business_order + 1, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE section = 'business' AND title = 'Pricing');

  -- Fix "For Partners" link - ensure it points to /become-a-partner
  UPDATE footer_links
  SET href = '/become-a-partner',
      updated_at = NOW()
  WHERE section = 'business'
    AND title = 'For Partners'
    AND href != '/become-a-partner';

  -- If For Partners link doesn't exist, create it
  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'business', 'For Partners', '/become-a-partner', max_business_order + 2, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE section = 'business' AND title = 'For Partners');

  -- Fix "Support" link - ensure it points to /help
  UPDATE footer_links
  SET href = '/help',
      updated_at = NOW()
  WHERE section = 'business'
    AND title = 'Support'
    AND href != '/help';

  -- If Support link doesn't exist, create it
  INSERT INTO footer_links (section, title, href, display_order, is_external, is_active, created_at, updated_at)
  SELECT 'business', 'Support', '/help', max_business_order + 3, false, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM footer_links WHERE section = 'business' AND title = 'Support');

  RAISE NOTICE 'Fixed footer business section links';
END $$;
