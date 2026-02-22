-- Add RLS policy to allow superadmins to delete users
-- This allows superadmins to permanently delete user accounts

CREATE POLICY "Superadmins can delete users"
    ON users FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
