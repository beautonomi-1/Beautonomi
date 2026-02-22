-- Beautonomi Database Migration
-- 046_add_previous_software.sql
-- Adds field to track previous salon software used by providers (for competitor analysis)

-- Add previous_software field to providers table
ALTER TABLE providers 
ADD COLUMN IF NOT EXISTS previous_software TEXT,
ADD COLUMN IF NOT EXISTS previous_software_other TEXT; -- For custom entries

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_providers_previous_software ON providers(previous_software) WHERE previous_software IS NOT NULL;

-- Add comment
COMMENT ON COLUMN providers.previous_software IS 'Previous salon software the provider was using (e.g., Mangomint, Fresha, etc.). Used for competitor analysis and understanding provider migration patterns.';
COMMENT ON COLUMN providers.previous_software_other IS 'Custom entry when previous_software is "other".';
