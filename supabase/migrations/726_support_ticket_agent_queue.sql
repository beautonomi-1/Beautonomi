-- Migration 726: Enterprise support queue — agent attention model
--
-- Adds three columns to support_tickets:
--   1. last_staff_view_at  — when an agent last opened this ticket (for unread).
--   2. first_response_due_at — first-response SLA deadline (separate from the
--      resolution SLA in sla_resolution_due_at). Backfilled from created_at.
--   3. needs_agent_response — GENERATED STORED boolean:
--        true when the ticket is active AND (customer replied last OR it is new
--        without any staff reply).  This is the primary ordering signal for the
--        "Needs response" queue view.
--
-- Also adds two indexes tuned for the smart queue ORDER BY:
--   - Partial covering index on the active-ticket queue sort columns.
--   - Plain index on assigned_to for "Assigned to me" filter.

-- ─── 1. New columns ───────────────────────────────────────────────────────────

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS last_staff_view_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ;

-- Generated column: true when a response from an agent is needed.
-- Conditions:
--   * ticket is still active (not resolved or closed)
--   * AND either the customer was the last to write (last_message_from = 'customer')
--     OR the ticket is brand-new with no staff reply yet (status='open' AND first_staff_reply_at IS NULL)
--
-- NOTE: PostgreSQL requires all referenced columns to already exist before a
-- GENERATED column can reference them. All of last_message_from, first_staff_reply_at,
-- and status exist since migrations 110 and 445.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS needs_agent_response boolean
    GENERATED ALWAYS AS (
      status NOT IN ('resolved', 'closed')
      AND (
        last_message_from = 'customer'
        OR (status = 'open' AND first_staff_reply_at IS NULL)
      )
    ) STORED;

-- ─── 2. Backfill first_response_due_at ───────────────────────────────────────
-- Only backfill active tickets where first_response_due_at is still NULL.
-- Windows mirror firstResponseSlaHoursForPriority() in support-ticket-sla.ts:
--   urgent  → 0.5 h  (30 minutes)
--   high    → 2 h
--   medium  → 8 h
--   low     → 24 h
UPDATE public.support_tickets
SET first_response_due_at = created_at + (
  CASE COALESCE(priority, 'medium')
    WHEN 'urgent' THEN INTERVAL '30 minutes'
    WHEN 'high'   THEN INTERVAL '2 hours'
    WHEN 'medium' THEN INTERVAL '8 hours'
    WHEN 'low'    THEN INTERVAL '24 hours'
    ELSE                INTERVAL '8 hours'
  END
)
WHERE first_response_due_at IS NULL
  AND status NOT IN ('resolved', 'closed');

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────

-- Partial covering index for the smart queue ORDER BY on active tickets:
--   needs_agent_response DESC, priority_rank ASC,
--   sla_resolution_due_at ASC NULLS LAST, last_message_at ASC NULLS LAST
-- NOTE: plain (non-CONCURRENTLY) CREATE INDEX so it runs inside the migration
-- transaction, consistent with the rest of supabase/migrations.
CREATE INDEX IF NOT EXISTS idx_support_tickets_agent_queue
  ON public.support_tickets (
    needs_agent_response DESC,
    priority_rank ASC,
    sla_resolution_due_at ASC NULLS LAST,
    last_message_at ASC NULLS LAST
  )
  WHERE status NOT IN ('resolved', 'closed');

-- Index for the "Assigned to me" / assignee filter (already covered by existing
-- PK lookups but a dedicated index speeds up list queries with assigned_to filter).
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
  ON public.support_tickets (assigned_to)
  WHERE assigned_to IS NOT NULL;
