-- Migration 745: Add session_url to identity_verification_sessions
--
-- Stores the Didit-provided verification URL so it can be returned
-- when a user resumes an existing live session (avoids a redundant
-- Didit API round-trip and ensures the URL is always available).

ALTER TABLE identity_verification_sessions
  ADD COLUMN IF NOT EXISTS session_url TEXT;

COMMENT ON COLUMN identity_verification_sessions.session_url IS
  'Didit verification URL (web redirect / WebView). Stored at session creation so resumed sessions can launch without a fresh Didit API call.';
