-- Beautonomi Database Migration
-- 051_profile_questions.sql
-- Creates profile_questions table for CMS-managed profile questions

-- Create profile_questions table
CREATE TABLE IF NOT EXISTS profile_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Question metadata
    question_key TEXT NOT NULL UNIQUE, -- e.g., 'school', 'work', 'favorite_song'
    question_label TEXT NOT NULL, -- Display label, e.g., "Where I went to school"
    question_description TEXT, -- Help text shown in modal
    input_type TEXT NOT NULL DEFAULT 'input', -- 'input' or 'textarea'
    input_placeholder TEXT,
    max_chars INTEGER DEFAULT 100,
    icon_name TEXT, -- Icon identifier for frontend (e.g., 'GraduationCap', 'Briefcase')
    
    -- Display settings
    display_order INTEGER NOT NULL DEFAULT 0,
    section TEXT NOT NULL DEFAULT 'profile', -- 'profile', 'about', 'preferences', 'interests'
    is_active BOOLEAN DEFAULT true,
    is_required BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_profile_questions_section ON profile_questions(section, display_order);
CREATE INDEX IF NOT EXISTS idx_profile_questions_active ON profile_questions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profile_questions_key ON profile_questions(question_key);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_profile_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profile_questions_updated_at ON profile_questions;
CREATE TRIGGER update_profile_questions_updated_at
    BEFORE UPDATE ON profile_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_questions_updated_at();

-- Enable RLS
ALTER TABLE profile_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can view active questions
CREATE POLICY "Public can view active profile questions"
    ON profile_questions FOR SELECT
    USING (is_active = true);

-- Superadmins can manage all questions
CREATE POLICY "Superadmins can manage profile questions"
    ON profile_questions FOR ALL
    USING (is_superadmin());

-- Insert default profile questions (matching current hardcoded questions)
INSERT INTO profile_questions (question_key, question_label, question_description, input_type, input_placeholder, max_chars, icon_name, display_order, section, is_active, is_required) VALUES
    ('school', 'Where I went to school', 'Whether it''s home school, high school, or trade school, name the school that made you who you are.', 'input', 'Where I went to school', 100, 'GraduationCap', 1, 'profile', true, false),
    ('work', 'My work', 'Tell us what your profession is. If you don''t have a traditional job, tell us your life''s calling. Example: Nurse, parent to four kids, or retired surfer.', 'input', 'My work:', 100, 'Briefcase', 2, 'profile', true, false),
    ('location', 'Where I live', 'Share where you currently live.', 'input', 'Search for your city', 100, 'MapPin', 3, 'profile', true, false),
    ('languages', 'Languages I speak', 'Select the languages you speak.', 'select', '', 0, 'Languages', 4, 'profile', true, false),
    ('decade_born', 'Decade I was born', 'Don''t worry, other people won''t be able to see your exact birthday.', 'select', '', 0, 'Calendar', 5, 'profile', true, false),
    ('favorite_song', 'My favorite song in high school', 'However embarrassing, share the tune you listened to on repeat as a teenager.', 'input', 'My favorite song in high school:', 100, 'Music', 6, 'profile', true, false),
    ('obsessed_with', 'I''m obsessed with', 'Share whatever you can''t get enough of—in a good way. Example: Baking rosemary focaccia.', 'input', 'I am obsessed with:', 100, 'Heart', 7, 'profile', true, false),
    ('fun_fact', 'My fun fact', 'Share something unique or unexpected about you. Example: I was in a music video or I''m a juggler.', 'input', 'My fun fact:', 100, 'Lightbulb', 8, 'profile', true, false),
    ('useless_skill', 'My most useless skill', 'Share a surprising but pointless talent you have. Example: Shuffling cards with one hand.', 'input', 'My most useless skill:', 100, 'Wand2', 9, 'profile', true, false),
    ('biography_title', 'My biography title would be', 'If someone wrote a book about your life, what would they call it? Example: Born to Roam or Chronicles of a Dog Mom.', 'input', 'My biography title would be:', 100, 'BookOpen', 10, 'profile', true, false),
    ('spend_time', 'I spend too much time', 'Share an activity or hobby you spend lots of free time on. Example: Watching cat videos or playing chess.', 'input', 'I spend my too much time:', 100, 'Clock', 11, 'profile', true, false),
    ('pets', 'Pets', 'Share any pets you have and their names. Example: My calico cat Whiskers, or Leonardo my speedy turtle.', 'input', 'Pets:', 100, 'PawPrint', 12, 'profile', true, false),
    ('about', 'About you', 'Tell us a little bit about yourself, so your future providers or clients can get to know you.', 'textarea', '', 450, null, 1, 'about', true, false),
    ('interests', 'What you''re into', 'Find common ground with other clients and Providers by adding interests to your profile.', 'select', '', 0, null, 1, 'interests', true, false),
    ('travel_destinations', 'Where you''ve been', 'Choose whether other people can see all the places you''ve been on Beautonomi.', 'select', '', 0, null, 1, 'preferences', true, false)
ON CONFLICT (question_key) DO NOTHING;
