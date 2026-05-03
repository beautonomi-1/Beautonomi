-- Beautonomi Database Migration
-- 571_cancellation_reasons_requires_note.sql
--
-- §Provider-audit 2026-05: the provider app's "Cancellation reasons" screen
-- exposes a "Require Note" toggle (so a staff-entered explanation is
-- required when the reason is picked). The column was missing on the
-- table, which silently dropped the toggle on insert/update. Add the
-- column with a safe default and document the intent.

ALTER TABLE public.cancellation_reasons
  ADD COLUMN IF NOT EXISTS requires_note BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cancellation_reasons.requires_note IS
  'When true, staff must enter a free-text note when picking this reason during cancellation.';
