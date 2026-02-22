-- 176_add_onboarding_metadata_fields.sql
-- Adds new onboarding metadata fields to providers table

ALTER TABLE providers
ADD COLUMN IF NOT EXISTS team_size TEXT CHECK (team_size IN ('freelancer', 'small', 'medium', 'large')),
ADD COLUMN IF NOT EXISTS yoco_machine TEXT CHECK (yoco_machine IN ('yes', 'no', 'other')),
ADD COLUMN IF NOT EXISTS yoco_machine_other TEXT,
ADD COLUMN IF NOT EXISTS payroll_type TEXT CHECK (payroll_type IN ('commission', 'hourly', 'both', 'other')),
ADD COLUMN IF NOT EXISTS payroll_details TEXT;

-- Add indexes for analytics and filtering
CREATE INDEX IF NOT EXISTS idx_providers_team_size ON providers(team_size) WHERE team_size IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_yoco_machine ON providers(yoco_machine) WHERE yoco_machine IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_payroll_type ON providers(payroll_type) WHERE payroll_type IS NOT NULL;

-- Add comments
COMMENT ON COLUMN providers.team_size IS 'Team size category: freelancer (solo), small (2-10), medium (11-20), large (20+)';
COMMENT ON COLUMN providers.yoco_machine IS 'Whether provider has Yoco machine: yes, no, or other';
COMMENT ON COLUMN providers.yoco_machine_other IS 'Name of other card machine if yoco_machine is "other"';
COMMENT ON COLUMN providers.payroll_type IS 'How provider pays staff: commission, hourly, both, or other';
COMMENT ON COLUMN providers.payroll_details IS 'Additional details about payroll structure if payroll_type is "other"';
