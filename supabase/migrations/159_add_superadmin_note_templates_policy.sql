-- Beautonomi Database Migration
-- 159_add_superadmin_note_templates_policy.sql
-- Adds superadmin policy for note_templates

-- Add superadmin policy for note_templates
DROP POLICY IF EXISTS "Superadmins can manage all note templates" ON note_templates;
CREATE POLICY "Superadmins can manage all note templates"
    ON note_templates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );
