-- 184_add_gift_card_to_footer.sql
-- Add Gift Card link to footer under "About Beautonomi" section

-- First, check if the gift card link already exists
DO $$
DECLARE
  existing_link_id uuid;
  max_order integer;
BEGIN
  -- Check if gift card link already exists
  SELECT id INTO existing_link_id
  FROM footer_links
  WHERE href = '/gift-card' AND section = 'about'
  LIMIT 1;

  -- If it doesn't exist, add it
  IF existing_link_id IS NULL THEN
    -- Get the max display_order for the "about" section
    SELECT COALESCE(MAX(display_order), 0) INTO max_order
    FROM footer_links
    WHERE section = 'about';

    -- Insert the gift card link
    INSERT INTO footer_links (
      section,
      title,
      href,
      display_order,
      is_external,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      'about',
      'Gift Cards',
      '/gift-card',
      max_order + 1,
      false,
      true,
      NOW(),
      NOW()
    );

    RAISE NOTICE 'Gift Card link added to footer under "About Beautonomi" section';
  ELSE
    RAISE NOTICE 'Gift Card link already exists in footer';
  END IF;
END $$;
