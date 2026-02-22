-- Migration: Add superadmin RLS policy for provider_twilio_integrations
-- 167_add_superadmin_twilio_integrations_policy.sql

-- Add superadmin policy for viewing all Twilio integrations
DROP POLICY IF EXISTS "Superadmins can view all twilio integrations" ON provider_twilio_integrations;
CREATE POLICY "Superadmins can view all twilio integrations"
  ON provider_twilio_integrations FOR SELECT
  USING (is_superadmin());

-- Add superadmin policy for managing all Twilio integrations
DROP POLICY IF EXISTS "Superadmins can manage all twilio integrations" ON provider_twilio_integrations;
CREATE POLICY "Superadmins can manage all twilio integrations"
  ON provider_twilio_integrations FOR ALL
  USING (is_superadmin());
