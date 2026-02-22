-- Beautonomi Database Migration
-- 096_portal_tokens.sql
-- Creates portal tokens table for passwordless client portal access

-- Portal Tokens table
CREATE TABLE IF NOT EXISTS public.portal_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE, -- Secure random token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Token expiration (default 7 days)
    used_at TIMESTAMP WITH TIME ZONE, -- When token was used (null = unused)
    usage_count INTEGER DEFAULT 0, -- Track how many times token was used
    max_uses INTEGER DEFAULT 1, -- Maximum number of times token can be used (default 1 = single-use)
    is_active BOOLEAN DEFAULT true, -- Can be revoked
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Index for fast token lookup
    CONSTRAINT portal_tokens_token_unique UNIQUE (token)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_portal_tokens_booking ON portal_tokens(booking_id);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON portal_tokens(token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_portal_tokens_expires ON portal_tokens(expires_at) WHERE is_active = true AND used_at IS NULL;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_portal_tokens_updated_at ON portal_tokens;
CREATE TRIGGER update_portal_tokens_updated_at BEFORE UPDATE ON portal_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE portal_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for portal_tokens
-- Tokens are accessed via token string, not user auth, so we need special policies

-- Allow reading tokens by token value (for validation)
-- This is safe because tokens are cryptographically secure
DROP POLICY IF EXISTS "Portal tokens can be read by token value" ON portal_tokens;
CREATE POLICY "Portal tokens can be read by token value"
    ON portal_tokens FOR SELECT
    USING (is_active = true AND expires_at > NOW());

-- Providers can view tokens for their bookings (for admin purposes)
DROP POLICY IF EXISTS "Providers can view tokens for their bookings" ON portal_tokens;
CREATE POLICY "Providers can view tokens for their bookings"
    ON portal_tokens FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            WHERE bookings.id = portal_tokens.booking_id
            AND EXISTS (
                SELECT 1 FROM providers
                WHERE providers.id = bookings.provider_id
                AND providers.user_id = auth.uid()
            )
        )
    );

-- System can insert/update tokens (via service role)
-- Note: This requires service role key, which bypasses RLS
-- For application-level inserts, we'll use service role client

-- Function to generate secure random token
CREATE OR REPLACE FUNCTION generate_portal_token()
RETURNS TEXT AS $$
DECLARE
    token_bytes BYTEA;
    token_hex TEXT;
BEGIN
    -- Generate 32 random bytes (256 bits)
    token_bytes := gen_random_bytes(32);
    -- Convert to hex string (64 characters)
    token_hex := encode(token_bytes, 'hex');
    -- Return token
    RETURN token_hex;
END;
$$ LANGUAGE plpgsql;

-- Function to validate and use portal token
CREATE OR REPLACE FUNCTION validate_portal_token(p_token TEXT)
RETURNS TABLE (
    booking_id UUID,
    is_valid BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_token_record portal_tokens%ROWTYPE;
BEGIN
    -- Find token
    SELECT * INTO v_token_record
    FROM portal_tokens
    WHERE token = p_token
    AND is_active = true;

    -- Token not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, false, 'Token not found'::TEXT;
        RETURN;
    END IF;

    -- Token expired
    IF v_token_record.expires_at < NOW() THEN
        RETURN QUERY SELECT v_token_record.booking_id, false, 'Token expired'::TEXT;
        RETURN;
    END IF;

    -- Token already used (if single-use)
    IF v_token_record.max_uses = 1 AND v_token_record.used_at IS NOT NULL THEN
        RETURN QUERY SELECT v_token_record.booking_id, false, 'Token already used'::TEXT;
        RETURN;
    END IF;

    -- Usage limit exceeded
    IF v_token_record.usage_count >= v_token_record.max_uses THEN
        RETURN QUERY SELECT v_token_record.booking_id, false, 'Token usage limit exceeded'::TEXT;
        RETURN;
    END IF;

    -- Token is valid
    RETURN QUERY SELECT v_token_record.booking_id, true, 'Valid'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark token as used
CREATE OR REPLACE FUNCTION use_portal_token(p_token TEXT)
RETURNS UUID AS $$
DECLARE
    v_booking_id UUID;
BEGIN
    -- Update token usage
    UPDATE portal_tokens
    SET 
        used_at = COALESCE(used_at, NOW()),
        usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE token = p_token
    AND is_active = true
    AND expires_at > NOW()
    AND (max_uses = -1 OR usage_count < max_uses) -- -1 = unlimited uses
    RETURNING booking_id INTO v_booking_id;

    RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
