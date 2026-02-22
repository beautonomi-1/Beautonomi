-- ============================================================================
-- Migration 130: City Waitlist Table
-- ============================================================================
-- This migration creates the city_waitlist table for tracking city expansion interest
-- ============================================================================

-- Create city_waitlist table
CREATE TABLE IF NOT EXISTS public.city_waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    city_name TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_building_owner BOOLEAN DEFAULT false,
    building_address TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_city_waitlist_city ON city_waitlist(city_name);
CREATE INDEX IF NOT EXISTS idx_city_waitlist_status ON city_waitlist(status);
CREATE INDEX IF NOT EXISTS idx_city_waitlist_user ON city_waitlist(user_id);
CREATE INDEX IF NOT EXISTS idx_city_waitlist_created ON city_waitlist(created_at DESC);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_city_waitlist_updated_at ON city_waitlist;
CREATE TRIGGER update_city_waitlist_updated_at 
    BEFORE UPDATE ON city_waitlist
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE city_waitlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can insert (join waitlist)
DROP POLICY IF EXISTS "Public can join city waitlist" ON city_waitlist;
CREATE POLICY "Public can join city waitlist"
    ON city_waitlist FOR INSERT
    TO public
    WITH CHECK (true);

-- Users can view their own entries
DROP POLICY IF EXISTS "Users can view own city waitlist entries" ON city_waitlist;
CREATE POLICY "Users can view own city waitlist entries"
    ON city_waitlist FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can view all entries
DROP POLICY IF EXISTS "Admins can manage city waitlist" ON city_waitlist;
CREATE POLICY "Admins can manage city waitlist"
    ON city_waitlist FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
