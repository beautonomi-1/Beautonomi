-- Migration 754: Terminal admin notes
--
-- Lightweight per-provider admin notes for terminal insights (commercial ops).
-- Separate from provider_notes to avoid scope creep into general support notes.

CREATE TABLE IF NOT EXISTS public.terminal_admin_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_admin_notes_provider_id
  ON public.terminal_admin_notes(provider_id, created_at DESC);

ALTER TABLE public.terminal_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_admin_notes_service_role ON public.terminal_admin_notes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.terminal_admin_notes IS
  'Admin-only notes on provider terminal commercial status (e.g. follow-ups, intent, outcome).';
