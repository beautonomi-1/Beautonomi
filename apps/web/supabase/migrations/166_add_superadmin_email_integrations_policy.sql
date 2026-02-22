-- Migration: Add superadmin RLS policy for provider_email_integrations
-- 166_add_superadmin_email_integrations_policy.sql

-- Add superadmin policy for viewing all email integrations
DROP POLICY IF EXISTS "Superadmins can view all email integrations" ON provider_email_integrations;
CREATE POLICY "Superadmins can view all email integrations"
  ON provider_email_integrations FOR SELECT
  USING (is_superadmin());

-- Add superadmin policy for managing all email integrations
DROP POLICY IF EXISTS "Superadmins can manage all email integrations" ON provider_email_integrations;
CREATE POLICY "Superadmins can manage all email integrations"
  ON provider_email_integrations FOR ALL
  USING (is_superadmin());
