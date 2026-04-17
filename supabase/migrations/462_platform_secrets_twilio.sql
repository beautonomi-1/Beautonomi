-- ============================================================================
-- Migration 462: Add Twilio secrets to platform_secrets
-- ============================================================================
-- Follows the same pattern as OneSignal / Paystack / Mapbox:
-- secrets stored in platform_secrets (admin-only RLS), NOT in
-- platform_settings JSON (which has public-read policies).
-- ============================================================================

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS twilio_sms_from TEXT,
  ADD COLUMN IF NOT EXISTS twilio_whatsapp_from TEXT;
