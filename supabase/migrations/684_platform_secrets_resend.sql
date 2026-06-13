-- ============================================================================
-- Migration 684: Add Resend transactional email secrets to platform_secrets
-- ============================================================================
-- Follows the same pattern as Twilio / OneSignal / Paystack:
-- API key stored in platform_secrets (admin-only RLS), NOT in platform_settings.
-- ============================================================================

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS resend_api_key TEXT,
  ADD COLUMN IF NOT EXISTS resend_from_address TEXT;

COMMENT ON COLUMN public.platform_secrets.resend_api_key IS
  'Resend REST API key for transactional email (notification queue, broadcasts, guest links).';
COMMENT ON COLUMN public.platform_secrets.resend_from_address IS
  'Default From header for Resend sends, e.g. Beautonomi <notifications@beautonomi.app>.';
