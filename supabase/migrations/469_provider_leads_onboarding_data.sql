-- Add onboarding data and invite columns to provider_leads
ALTER TABLE provider_leads ADD COLUMN IF NOT EXISTS onboarding_data JSONB;
ALTER TABLE provider_leads ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE provider_leads ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;
ALTER TABLE provider_leads ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;

CREATE INDEX idx_provider_leads_invite_token ON provider_leads(invite_token) WHERE invite_token IS NOT NULL;

COMMENT ON COLUMN provider_leads.onboarding_data IS 'Pre-filled onboarding wizard data collected during lead capture for assisted conversion.';
COMMENT ON COLUMN provider_leads.invite_token IS 'Unique token for self-service onboarding invite links.';
COMMENT ON COLUMN provider_leads.invite_sent_at IS 'Timestamp of last onboarding invite dispatch.';
COMMENT ON COLUMN provider_leads.invite_accepted_at IS 'Timestamp when the provider completed self-service onboarding via invite link.';
