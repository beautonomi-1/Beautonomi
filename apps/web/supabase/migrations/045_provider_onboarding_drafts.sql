-- Beautonomi Database Migration
-- 045_provider_onboarding_drafts.sql
-- Adds draft saving for provider onboarding

-- Provider onboarding drafts table
CREATE TABLE IF NOT EXISTS provider_onboarding_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    draft_data JSONB NOT NULL DEFAULT '{}',
    current_step INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_provider_onboarding_drafts_user ON provider_onboarding_drafts(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_provider_onboarding_drafts_updated_at
    BEFORE UPDATE ON provider_onboarding_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE provider_onboarding_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own onboarding drafts"
    ON provider_onboarding_drafts FOR ALL
    USING (user_id = auth.uid());

-- Add comment
COMMENT ON TABLE provider_onboarding_drafts IS 'Stores draft data for provider onboarding, allowing users to save progress and resume later.';
COMMENT ON COLUMN provider_onboarding_drafts.draft_data IS 'JSONB object containing all onboarding form data.';
COMMENT ON COLUMN provider_onboarding_drafts.current_step IS 'The current step number where the user left off.';
