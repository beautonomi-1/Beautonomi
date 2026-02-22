-- Beautonomi Database Migration
-- 078_add_service_team_members_and_pricing_options.sql
-- Adds fields for team member associations and pricing options to offerings table

-- Add team_member_ids array to offerings (store as JSONB for flexibility)
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS team_member_ids UUID[] DEFAULT '{}';

-- Add pricing_options JSONB field to store multiple pricing configurations
ALTER TABLE offerings 
ADD COLUMN IF NOT EXISTS pricing_options JSONB DEFAULT '[]'::jsonb;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_offerings_team_member_ids ON offerings USING GIN(team_member_ids);
CREATE INDEX IF NOT EXISTS idx_offerings_pricing_options ON offerings USING GIN(pricing_options);

-- Add comments
COMMENT ON COLUMN offerings.team_member_ids IS 'Array of team member UUIDs assigned to this service';
COMMENT ON COLUMN offerings.pricing_options IS 'JSON array of pricing options with duration, price_type, price, and pricing_name';
