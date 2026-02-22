-- 187_remove_unwanted_footer_links.sql
-- Remove unwanted footer links: Beautonomi Friendly, Against Discrimination, Release Notes, Why Beautonomi

DO $$
BEGIN
  -- Remove "Beautonomi Friendly" link
  DELETE FROM footer_links
  WHERE section = 'about'
    AND title = 'Beautonomi Friendly'
    AND href = '/beautonomi-friendly';

  -- Remove "Against Discrimination" link
  DELETE FROM footer_links
  WHERE section = 'about'
    AND title = 'Against Discrimination'
    AND href = '/against-discrimination';

  -- Remove "Release Notes" link
  DELETE FROM footer_links
  WHERE section = 'about'
    AND title = 'Release Notes'
    AND href = '/release';

  -- Remove "Why Beautonomi" link
  DELETE FROM footer_links
  WHERE section = 'about'
    AND title = 'Why Beautonomi'
    AND href = '/why-beautonomi';

  RAISE NOTICE 'Removed unwanted footer links';
END $$;
