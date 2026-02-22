-- ============================================================================
-- Migration 150: Add Default Tax Rate to Platform Settings
-- ============================================================================
-- This migration adds a default tax rate to platform_settings that can be
-- configured by superadmin. This rate is used as a fallback when providers
-- don't have their own tax_rate_percent configured.
-- ============================================================================

-- Update platform_settings to include default_tax_rate in the settings JSONB
-- If no active settings exist, create one with default tax rate
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
    )
  ),
  true
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE is_active = true);

-- Update existing platform_settings to add default_tax_rate if it doesn't exist
UPDATE platform_settings
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{taxes,default_tax_rate}',
  '15.00'::jsonb,
  true
)
WHERE is_active = true
  AND (settings->'taxes'->>'default_tax_rate' IS NULL 
       OR settings->'taxes'->>'default_tax_rate' = 'null');

-- Add comment
COMMENT ON COLUMN platform_settings.settings IS 'Platform-wide settings including default_tax_rate in taxes.default_tax_rate (percentage, e.g., 15.00 for 15%)';
