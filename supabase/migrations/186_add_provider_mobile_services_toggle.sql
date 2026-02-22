-- Beautonomi Database Migration
-- 186_add_provider_mobile_services_toggle.sql
-- Adds offers_mobile_services column to providers table

-- Add offers_mobile_services column (default true for backward compatibility)
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS offers_mobile_services BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN providers.offers_mobile_services IS 'Whether this provider offers mobile/house call services. Defaults to true for existing providers.';

-- Create index for filtering providers by mobile service availability
CREATE INDEX IF NOT EXISTS idx_providers_mobile_services 
ON providers(offers_mobile_services, status) 
WHERE offers_mobile_services = true AND status = 'active';
