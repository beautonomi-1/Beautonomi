-- Beautonomi Database Migration
-- 013_recently_viewed.sql
-- Adds support for user-specific "recently viewed providers"

-- Recently viewed providers (per user)
CREATE TABLE IF NOT EXISTS recently_viewed_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_viewed_at
    ON recently_viewed_providers(user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_provider
    ON recently_viewed_providers(provider_id);

-- updated_at trigger
CREATE TRIGGER update_recently_viewed_updated_at BEFORE UPDATE ON recently_viewed_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE recently_viewed_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recently viewed"
    ON recently_viewed_providers FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

