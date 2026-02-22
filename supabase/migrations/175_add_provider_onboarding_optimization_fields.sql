-- 175_add_provider_onboarding_optimization_fields.sql
-- Add missing fields for provider onboarding optimization
-- These fields are needed for optimal public homepage visibility

-- Add fields to providers table
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS accepts_custom_requests BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS response_rate INTEGER DEFAULT 100 CHECK (response_rate >= 0 AND response_rate <= 100),
ADD COLUMN IF NOT EXISTS response_time_hours INTEGER DEFAULT 1 CHECK (response_time_hours >= 0),
ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT ARRAY['English']::TEXT[];

-- Add comments
COMMENT ON COLUMN providers.accepts_custom_requests IS 'Whether the provider accepts custom service requests from clients';
COMMENT ON COLUMN providers.response_rate IS 'Provider response rate percentage (0-100)';
COMMENT ON COLUMN providers.response_time_hours IS 'Average response time in hours';
COMMENT ON COLUMN providers.languages_spoken IS 'Array of human languages the provider can communicate in (e.g., English, Zulu, Afrikaans)';

-- Create index for languages_spoken for better search performance
CREATE INDEX IF NOT EXISTS idx_providers_languages_spoken ON providers USING GIN (languages_spoken);

-- Create index for accepts_custom_requests for filtering
CREATE INDEX IF NOT EXISTS idx_providers_accepts_custom_requests ON providers(accepts_custom_requests) WHERE accepts_custom_requests = true;
