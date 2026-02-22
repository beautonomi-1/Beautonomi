-- Beautonomi Database Migration
-- 075_migrate_services_to_provider_categories.sql
-- Migrates services (offerings) to use provider_categories instead of global_service_categories

-- Add provider_category_id column to offerings table
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS provider_category_id UUID REFERENCES provider_categories(id) ON DELETE SET NULL;

-- Create index for provider_category_id
CREATE INDEX IF NOT EXISTS idx_offerings_provider_category ON offerings(provider_category_id);

-- Migrate existing data: For each offering, try to find or create a matching provider category
-- This is a best-effort migration - providers should review and organize their categories
DO $$
DECLARE
  v_offering RECORD;
  v_provider_category_id UUID;
  v_category_name TEXT;
BEGIN
  -- For each offering that has a global category but no provider category
  FOR v_offering IN 
    SELECT o.id, o.provider_id, o.category_id, o.title, gc.name as global_category_name
    FROM offerings o
    LEFT JOIN global_service_categories gc ON gc.id = o.category_id
    WHERE o.provider_category_id IS NULL
      AND o.category_id IS NOT NULL
  LOOP
    -- Try to find existing provider category with same name
    SELECT id INTO v_provider_category_id
    FROM provider_categories
    WHERE provider_id = v_offering.provider_id
      AND name = COALESCE(v_offering.global_category_name, 'Uncategorized')
    LIMIT 1;
    
    -- If not found, create a new provider category
    IF v_provider_category_id IS NULL THEN
      INSERT INTO provider_categories (
        provider_id,
        name,
        slug,
        display_order,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        v_offering.provider_id,
        COALESCE(v_offering.global_category_name, 'Uncategorized'),
        LOWER(REGEXP_REPLACE(COALESCE(v_offering.global_category_name, 'Uncategorized'), '[^a-zA-Z0-9]+', '-', 'g')),
        (SELECT COALESCE(MAX(display_order), 0) + 1 FROM provider_categories WHERE provider_id = v_offering.provider_id),
        true,
        NOW(),
        NOW()
      )
      RETURNING id INTO v_provider_category_id;
    END IF;
    
    -- Update the offering to use the provider category
    UPDATE offerings
    SET provider_category_id = v_provider_category_id
    WHERE id = v_offering.id;
  END LOOP;
END $$;

-- Add comment explaining the change
COMMENT ON COLUMN offerings.provider_category_id IS 'Provider-specific category for this service. Services should be organized using provider_categories, not global_service_categories.';
COMMENT ON COLUMN offerings.category_id IS 'Legacy field - kept for reference but services should use provider_category_id instead.';
