-- 188_remove_duplicate_pricing_link.sql
-- Remove duplicate "Pricing" link from business section
-- Keep the one pointing to /pricing, remove any others

DO $$
BEGIN
  -- Remove duplicate Pricing links, keeping only the one with href='/pricing'
  -- First, remove any Pricing links that don't point to /pricing
  DELETE FROM footer_links
  WHERE section = 'business'
    AND title = 'Pricing'
    AND href != '/pricing';

  -- If there are still multiple Pricing links pointing to /pricing, keep only the one with the lowest display_order
  -- (or the first one created)
  DELETE FROM footer_links
  WHERE id IN (
    SELECT id
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY section, title, href ORDER BY display_order ASC, created_at ASC) as rn
      FROM footer_links
      WHERE section = 'business'
        AND title = 'Pricing'
        AND href = '/pricing'
    ) ranked
    WHERE rn > 1
  );

  RAISE NOTICE 'Removed duplicate Pricing links from business section';
END $$;
