-- Beautonomi Database Migration
-- 081_service_addons_and_variants.sql
-- Adds support for service add-ons and variants relationships

-- Add parent_service_id for variants (links variant to its parent service)
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS parent_service_id UUID REFERENCES offerings(id) ON DELETE SET NULL;

-- Add applicable_service_ids for add-ons (which main services can have this add-on)
-- NULL means available for all services, array of IDs means only those services
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS applicable_service_ids UUID[] DEFAULT NULL;

-- Add addon_category to group add-ons (e.g., "Hair Treatments", "Nail Enhancements")
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS addon_category TEXT DEFAULT NULL;

-- Add variant_name for better display (e.g., "Short Hair", "Long Hair")
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS variant_name TEXT DEFAULT NULL;

-- Add is_recommended flag for add-ons to highlight popular ones
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT false;

-- Add sort_order for variants to control display order
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS variant_sort_order INT DEFAULT 0;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_offerings_parent_service ON offerings(parent_service_id) WHERE parent_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offerings_service_type ON offerings(service_type);
CREATE INDEX IF NOT EXISTS idx_offerings_addon_category ON offerings(addon_category) WHERE addon_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offerings_applicable_services ON offerings USING GIN(applicable_service_ids) WHERE applicable_service_ids IS NOT NULL;

-- Add comments
COMMENT ON COLUMN offerings.parent_service_id IS 'For variants: links to the parent/base service';
COMMENT ON COLUMN offerings.applicable_service_ids IS 'For add-ons: array of service IDs this add-on can be added to. NULL means available for all services.';
COMMENT ON COLUMN offerings.addon_category IS 'Category to group add-ons (e.g., Hair Treatments, Nail Enhancements)';
COMMENT ON COLUMN offerings.variant_name IS 'Short name for variant display (e.g., Short Hair, Long Hair)';
COMMENT ON COLUMN offerings.is_recommended IS 'Flag to highlight recommended/popular add-ons';
COMMENT ON COLUMN offerings.variant_sort_order IS 'Sort order for variants within a parent service';

-- Create view for services with their variants grouped
-- Drop if exists as a table (cannot replace table with view)
DROP TABLE IF EXISTS services_with_variants CASCADE;
DROP VIEW IF EXISTS services_with_variants CASCADE;

CREATE VIEW services_with_variants AS
SELECT 
    s.*,
    COALESCE(
        (SELECT json_agg(v ORDER BY v.variant_sort_order, v.price)
         FROM offerings v 
         WHERE v.parent_service_id = s.id 
         AND v.service_type = 'variant'
         AND v.is_active = true),
        '[]'::json
    ) as variants,
    (SELECT COUNT(*) 
     FROM offerings v 
     WHERE v.parent_service_id = s.id 
     AND v.service_type = 'variant'
     AND v.is_active = true) as variant_count
FROM offerings s
WHERE s.service_type != 'variant' 
   OR s.parent_service_id IS NULL;

-- Create view for getting add-ons applicable to a service
-- Drop if exists as a table (cannot replace table with view)
DROP TABLE IF EXISTS service_addons CASCADE;
DROP VIEW IF EXISTS service_addons CASCADE;

CREATE VIEW service_addons AS
SELECT a.*
FROM offerings a
WHERE a.service_type = 'addon'
AND a.is_active = true;

-- Function to get add-ons for a specific service
CREATE OR REPLACE FUNCTION get_addons_for_service(service_id UUID, provider_uuid UUID)
RETURNS SETOF offerings AS $$
BEGIN
    RETURN QUERY
    SELECT o.*
    FROM offerings o
    WHERE o.provider_id = provider_uuid
    AND o.service_type = 'addon'
    AND o.is_active = true
    AND (
        o.applicable_service_ids IS NULL  -- Available for all services
        OR service_id = ANY(o.applicable_service_ids)  -- Specifically linked to this service
    )
    ORDER BY o.is_recommended DESC, o.addon_category, o.display_order, o.title;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get variants for a service
CREATE OR REPLACE FUNCTION get_variants_for_service(service_id UUID)
RETURNS SETOF offerings AS $$
BEGIN
    RETURN QUERY
    SELECT o.*
    FROM offerings o
    WHERE o.parent_service_id = service_id
    AND o.service_type = 'variant'
    AND o.is_active = true
    ORDER BY o.variant_sort_order, o.price;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add reference data for addon categories
INSERT INTO reference_data (type, value, label, description, display_order, metadata) VALUES
('addon_category', 'hair_treatments', 'Hair Treatments', 'Deep conditioning, treatments, etc.', 1, '{}'),
('addon_category', 'nail_enhancements', 'Nail Enhancements', 'Nail art, extensions, etc.', 2, '{}'),
('addon_category', 'skin_treatments', 'Skin Treatments', 'Masks, peels, serums, etc.', 3, '{}'),
('addon_category', 'massage_extras', 'Massage Extras', 'Hot stones, aromatherapy, etc.', 4, '{}'),
('addon_category', 'styling_extras', 'Styling Extras', 'Blow dry, styling products, etc.', 5, '{}'),
('addon_category', 'waxing_extras', 'Waxing Extras', 'Additional areas, soothing treatments', 6, '{}'),
('addon_category', 'general', 'General Add-ons', 'Other optional extras', 7, '{}')
ON CONFLICT (type, value) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
