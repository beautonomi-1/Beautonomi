-- Optional persistence for admin copilot conversations (Phase 4B).

CREATE TABLE IF NOT EXISTS public.admin_copilot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_context jsonb,
  resolved_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.admin_copilot_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  tool_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_copilot_conversations_tenant_user_idx
  ON public.admin_copilot_conversations (tenant_id, admin_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_copilot_messages_conversation_idx
  ON public.admin_copilot_messages (conversation_id, created_at);

ALTER TABLE public.admin_copilot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_copilot_messages ENABLE ROW LEVEL SECURITY;
