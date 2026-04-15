-- Per-session WasenderAPI bearer token (from GET session details `api_key`).
-- Required for POST /api/send-message and /api/on-whatsapp/... — not the account PAT.

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS wasender_session_api_key TEXT;

COMMENT ON COLUMN public.whatsapp_sessions.wasender_session_api_key IS
  'Wasender session API key (Bearer) for messaging; from session details after connect.';

-- Align default API host with Wasender docs (https://www.wasenderapi.com/api-docs).
ALTER TABLE public.wasender_integration_config
  ALTER COLUMN base_url SET DEFAULT 'https://www.wasenderapi.com';

UPDATE public.wasender_integration_config
SET base_url = 'https://www.wasenderapi.com'
WHERE base_url = 'https://app.wasenderapi.com';
