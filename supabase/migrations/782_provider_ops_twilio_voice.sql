-- ============================================================================
-- Migration 782: Twilio Voice secrets for Provider Ops in-browser dialer
-- ============================================================================
-- Follows the same pattern as migration 462 (Twilio SMS/WhatsApp secrets):
-- API key, TwiML app, and voice caller ID live in platform_secrets (admin RLS).
-- ============================================================================

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS twilio_api_key_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_api_key_secret TEXT,
  ADD COLUMN IF NOT EXISTS twilio_twiml_app_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_voice_from TEXT;

COMMENT ON COLUMN public.platform_secrets.twilio_api_key_sid IS
  'Twilio API Key SID (SK...) for Voice SDK access-token signing.';
COMMENT ON COLUMN public.platform_secrets.twilio_api_key_secret IS
  'Twilio API Key secret paired with twilio_api_key_sid.';
COMMENT ON COLUMN public.platform_secrets.twilio_twiml_app_sid IS
  'Twilio TwiML Application SID (AP...) for outbound Voice SDK calls.';
COMMENT ON COLUMN public.platform_secrets.twilio_voice_from IS
  'E.164 caller ID shown to leads on outbound Provider Ops voice calls.';
