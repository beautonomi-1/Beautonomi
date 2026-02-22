-- Add RLS policy to allow superadmins to insert (create) users
-- This fixes the issue where superadmins cannot create users

CREATE POLICY "Superadmins can insert users"
    ON users FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
