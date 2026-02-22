-- Beautonomi Database Migration
-- 077_add_service_type.sql
-- Adds service_type field to offerings table for service classification

-- Add service_type column to offerings table
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'basic'; -- basic, package, addon, variant

-- Add comment
COMMENT ON COLUMN offerings.service_type IS 'Type of service: basic (standalone service), package (includes multiple services), addon (optional extra service added to main service), variant (different version/option of the same base service)';
