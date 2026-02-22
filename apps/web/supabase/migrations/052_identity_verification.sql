-- Beautonomi Database Migration
-- 052_identity_verification.sql
-- Creates identity verification system

-- Add verification fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verification_status TEXT DEFAULT 'pending'; -- 'pending', 'approved', 'rejected'
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verification_submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verification_reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verification_reviewed_by UUID REFERENCES users(id);

-- Create user_verifications table for detailed verification records
CREATE TABLE IF NOT EXISTS user_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Document information
    document_type TEXT NOT NULL, -- 'license', 'passport', 'identity'
    country TEXT NOT NULL,
    document_url TEXT NOT NULL, -- URL to document in storage
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    rejection_reason TEXT, -- Reason if rejected
    
    -- Metadata
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_verifications_user_id ON user_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_verifications_status ON user_verifications(status);
CREATE INDEX IF NOT EXISTS idx_user_verifications_submitted_at ON user_verifications(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_verification_status ON users(identity_verification_status);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_verifications_updated_at ON user_verifications;
CREATE TRIGGER update_user_verifications_updated_at
    BEFORE UPDATE ON user_verifications
    FOR EACH ROW
    EXECUTE FUNCTION update_user_verifications_updated_at();

-- Function to update user verification status when verification is reviewed
CREATE OR REPLACE FUNCTION update_user_verification_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update users table when verification status changes
    IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
        UPDATE users
        SET 
            identity_verified = (NEW.status = 'approved'),
            identity_verification_status = NEW.status,
            identity_verification_reviewed_at = NEW.reviewed_at,
            identity_verification_reviewed_by = NEW.reviewed_by
        WHERE id = NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_verification_status_change ON user_verifications;
CREATE TRIGGER on_verification_status_change
    AFTER UPDATE OF status ON user_verifications
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION update_user_verification_status();

-- Enable RLS
ALTER TABLE user_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own verifications
CREATE POLICY "Users can view own verifications"
    ON user_verifications FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own verifications
CREATE POLICY "Users can insert own verifications"
    ON user_verifications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Superadmins can view all verifications
CREATE POLICY "Superadmins can view all verifications"
    ON user_verifications FOR SELECT
    USING (is_superadmin());

-- Superadmins can update all verifications
CREATE POLICY "Superadmins can update all verifications"
    ON user_verifications FOR UPDATE
    USING (is_superadmin());

-- Comments
COMMENT ON TABLE user_verifications IS 'Stores identity verification documents and their review status';
COMMENT ON COLUMN users.identity_verified IS 'Whether the user has been verified (true if any verification is approved)';
COMMENT ON COLUMN users.identity_verification_status IS 'Current verification status: pending, approved, or rejected';
