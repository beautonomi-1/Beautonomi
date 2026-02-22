-- ============================================================================
-- Migration 190: Add Auto-Approve Setting to Platform Settings
-- ============================================================================
-- This migration adds an auto-approve toggle to platform_settings that allows
-- superadmin to automatically approve provider applications without manual review.
-- ============================================================================

-- Update platform_settings to include auto_approve_providers in the settings JSONB
-- If no active settings exist, create one with auto_approve disabled by default
INSERT INTO platform_settings (settings, is_active)
SELECT 
  jsonb_build_object(
    'branding', jsonb_build_object(
      'site_name', 'Beautonomi',
      'logo_url', '',
      'primary_color', '#000000',
      'secondary_color', '#FF0077'
    ),
    'localization', jsonb_build_object(
      'default_language', 'en',
      'supported_languages', jsonb_build_array('en', 'af', 'zu'),
      'default_currency', 'ZAR',
      'supported_currencies', jsonb_build_array('ZAR', 'USD', 'EUR'),
      'timezone', 'Africa/Johannesburg'
    ),
    'payouts', jsonb_build_object(
      'provider_payout_percentage', 85,
      'payout_schedule', 'weekly',
      'minimum_payout_amount', 100
    ),
    'notifications', jsonb_build_object(
      'email_enabled', true,
      'sms_enabled', false,
      'push_enabled', true
    ),
    'taxes', jsonb_build_object(
      'default_tax_rate', 15.00
    ),
    'providers', jsonb_build_object(
      'auto_approve', false
    )
  ),
  true
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE is_active = true);

-- Update existing platform_settings to add auto_approve if it doesn't exist
UPDATE platform_settings
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{providers,auto_approve}',
  'false'::jsonb,
  true
)
WHERE is_active = true
  AND (settings->'providers'->>'auto_approve' IS NULL 
       OR settings->'providers'->>'auto_approve' = 'null');

-- Add comment
COMMENT ON COLUMN platform_settings.settings IS 'Platform-wide settings including providers.auto_approve (boolean) to automatically approve provider applications';
