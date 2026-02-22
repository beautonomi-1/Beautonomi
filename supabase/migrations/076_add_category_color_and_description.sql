-- Beautonomi Database Migration
-- 076_add_category_color_and_description.sql
-- Adds color and description fields to provider_categories for better organization

-- Add color and description to provider_categories
ALTER TABLE provider_categories 
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#FF0077',
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add comment
COMMENT ON COLUMN provider_categories.color IS 'Appointment color for visual identification of services in this category';
COMMENT ON COLUMN provider_categories.description IS 'Short summary helping clients understand what types of services are included in this category';
