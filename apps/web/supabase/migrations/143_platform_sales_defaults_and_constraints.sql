-- ============================================================================
-- Migration 143: Platform Sales Defaults and Constraints
-- ============================================================================
-- Adds platform-wide defaults and constraints for sales settings
-- These can be overridden by individual providers
-- ============================================================================

-- Add sales defaults and constraints to platform_settings JSONB structure
-- This will be stored in the existing platform_settings.settings JSONB column

-- The structure will be:
-- {
--   "sales": {
--     "defaults": {
--       "tax_rate_percent": 0,
--       "receipt_prefix": "REC",
--       "receipt_next_number": 1,
--       "receipt_header": null,
--       "receipt_footer": null,
--       "gift_cards_enabled": false,
--       "gift_card_terms": null,
--       "service_charge_name": "Service Charge",
--       "service_charge_rate": 0,
--       "upselling_enabled": false
--     },
--     "constraints": {
--       "max_tax_rate_percent": 30,
--       "required_receipt_fields": ["receipt_number", "date", "total"],
--       "max_receipt_prefix_length": 20,
--       "min_receipt_next_number": 1
--     }
--   }
-- }

-- No schema changes needed - we'll use the existing platform_settings table
-- Just add a comment documenting the structure

COMMENT ON TABLE platform_settings IS 'Platform-wide settings stored as JSONB. Structure includes: branding, localization, payouts, notifications, payment_types, paystack, verification, onesignal, mapbox, amplitude, google, calendar_integrations, apps, and sales (defaults and constraints).';
