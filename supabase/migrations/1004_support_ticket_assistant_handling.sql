-- Support ticket AI assistant: handling_mode, author_kind, assistant last_message_from,
-- and needs_agent_response excludes assistant-handled tickets.

DROP INDEX IF EXISTS public.idx_support_tickets_agent_queue;

ALTER TABLE public.support_tickets DROP COLUMN IF EXISTS needs_agent_response;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS handling_mode text NOT NULL DEFAULT 'human'
    CHECK (handling_mode IN ('assistant', 'human')),
  ADD COLUMN IF NOT EXISTS assistant_handoff_at timestamptz;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_last_message_from_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_last_message_from_check
  CHECK (last_message_from IS NULL OR last_message_from IN ('customer', 'staff', 'assistant'));

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS author_kind text
    CHECK (author_kind IS NULL OR author_kind IN ('customer', 'staff', 'assistant'));

UPDATE public.support_ticket_messages m
SET author_kind = CASE
  WHEN m.user_id IS NOT NULL AND m.user_id = t.user_id THEN 'customer'
  WHEN COALESCE(m.is_internal, false) = true THEN 'staff'
  ELSE 'staff'
END
FROM public.support_tickets t
WHERE t.id = m.ticket_id AND m.author_kind IS NULL;

ALTER TABLE public.support_tickets
  ADD COLUMN needs_agent_response boolean
  GENERATED ALWAYS AS (
    status NOT IN ('resolved', 'closed')
    AND handling_mode = 'human'
    AND (
      last_message_from = 'customer'
      OR (status = 'open' AND first_staff_reply_at IS NULL)
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_support_tickets_agent_queue
  ON public.support_tickets (
    needs_agent_response DESC,
    priority_rank ASC,
    sla_resolution_due_at ASC NULLS LAST,
    last_message_at ASC NULLS LAST
  )
  WHERE status NOT IN ('resolved', 'closed');

CREATE INDEX IF NOT EXISTS idx_support_tickets_handling_mode
  ON public.support_tickets (handling_mode)
  WHERE status NOT IN ('resolved', 'closed');

COMMENT ON COLUMN public.support_tickets.handling_mode IS
  'assistant = customer-facing AI on thread; human = normal queue. Email/Zoho stay human.';
COMMENT ON COLUMN public.support_tickets.assistant_handoff_at IS
  'When the ticket moved from assistant to human; first_response_due_at anchors here after handoff.';
