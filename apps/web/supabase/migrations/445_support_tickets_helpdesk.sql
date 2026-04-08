-- Help desk fields: SLA targets, first response, customer activity, CSAT.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS first_staff_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_customer_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS csat_score SMALLINT,
  ADD COLUMN IF NOT EXISTS csat_comment TEXT;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_csat_score_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_csat_score_check
  CHECK (csat_score IS NULL OR (csat_score >= 1 AND csat_score <= 5));

CREATE INDEX IF NOT EXISTS idx_support_tickets_updated_at ON public.support_tickets (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_resolution_due_at ON public.support_tickets (sla_resolution_due_at);

-- Deterministic priority ordering for queues (urgent first).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS priority_rank SMALLINT;

CREATE OR REPLACE FUNCTION public.support_tickets_set_priority_rank()
RETURNS TRIGGER AS $$
BEGIN
  NEW.priority_rank := CASE COALESCE(NEW.priority, 'medium')
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 3
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_priority_rank ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_priority_rank
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.support_tickets_set_priority_rank();

CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_rank ON public.support_tickets (priority_rank);

UPDATE public.support_tickets
SET priority_rank = CASE COALESCE(priority, 'medium')
  WHEN 'urgent' THEN 1
  WHEN 'high' THEN 2
  WHEN 'medium' THEN 3
  WHEN 'low' THEN 4
  ELSE 3
END
WHERE priority_rank IS NULL;

-- Backfill SLA due from created_at + tiered resolution window (matches app helper).
UPDATE public.support_tickets
SET sla_resolution_due_at = created_at + (
  CASE COALESCE(priority, 'medium')
    WHEN 'urgent' THEN INTERVAL '4 hours'
    WHEN 'high' THEN INTERVAL '24 hours'
    WHEN 'medium' THEN INTERVAL '72 hours'
    WHEN 'low' THEN INTERVAL '168 hours'
    ELSE INTERVAL '72 hours'
  END
)
WHERE sla_resolution_due_at IS NULL;
