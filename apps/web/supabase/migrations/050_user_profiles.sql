-- Create user_profiles table to store extended profile information
-- This table stores all the profile questions and answers from the profile creation flow

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Basic profile info (from users table, but can be overridden here)
    avatar_url TEXT,
    about TEXT, -- "About you" section
    
    -- Profile questions (from create-profile page)
    school TEXT, -- "Where I went to school"
    work TEXT, -- "My work"
    location TEXT, -- "Where I live"
    languages TEXT[], -- Array of languages spoken
    decade_born TEXT, -- "Decade I was born"
    favorite_song TEXT, -- "My favorite song in high school"
    obsessed_with TEXT, -- "I'm obsessed with"
    fun_fact TEXT, -- "My fun fact"
    useless_skill TEXT, -- "My most useless skill"
    biography_title TEXT, -- "My biography title would be"
    spend_time TEXT, -- "I spend too much time"
    pets TEXT, -- "Pets"
    
    -- Additional sections
    interests TEXT[], -- Array of interests
    travel_destinations TEXT[], -- "Where you've been" destinations
    show_travel_history BOOLEAN DEFAULT true, -- Preference to show travel history
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_user_profiles_updated_at();

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view and manage their own profile
CREATE POLICY "Users can view own profile data"
    ON user_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile data"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile data"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- Superadmins can view all profiles
-- Note: This policy will work after migration 049_fix_rls_recursion.sql creates is_superadmin() function
-- If the function doesn't exist yet, this will fail - run migrations in order
CREATE POLICY "Superadmins can view all profile data"
    ON user_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Note: Profile questions are currently hardcoded in the frontend components
-- Future enhancement: Create a profile_questions table in CMS for superadmin management
