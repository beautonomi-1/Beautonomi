-- 875_admin_ops_consoles.sql
-- Part L (Superadmin and Slack): finance ops consoles.
--   1. ledger_repair_proposals — maker-checker queue for manual ledger repairs
--      (missing online-charge ledger rows, manual adjustments). admin_finance
--      proposes, superadmin approves; the approve step posts through the
--      existing settlement / adjustment helpers.
--   2. reconciliation_exceptions — assignment + resolution note columns for
--      the Reconciliation Exceptions admin page.
--   3. webhook_events — index for the signature-rejection dashboard.

-- ─── 1. Ledger repair proposals ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ledger_repair_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('missing_online_charge_ledger', 'adjustment')),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed', 'approved', 'rejected', 'posted')),
  approved_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  rejected_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at   TIMESTAMPTZ,
  posted_at     TIMESTAMPTZ,
  -- Ledger row / settlement result produced by the approve step.
  result        JSONB,
  error         TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_repair_proposals_status_created
  ON public.ledger_repair_proposals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_repair_proposals_tenant_created
  ON public.ledger_repair_proposals(tenant_id, created_at DESC);

-- One open proposal per booking payment: repeated "propose" clicks on the same
-- candidate must not queue duplicate postings. Adjustments have no natural key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_repair_open_booking_payment
  ON public.ledger_repair_proposals ((payload->>'bookingPaymentId'))
  WHERE kind = 'missing_online_charge_ledger'
    AND status IN ('proposed', 'approved')
    AND payload->>'bookingPaymentId' IS NOT NULL;

ALTER TABLE public.ledger_repair_proposals ENABLE ROW LEVEL SECURITY;

-- Service role only (all admin access goes through /api/admin with the admin client).
DROP POLICY IF EXISTS ledger_repair_proposals_superadmin ON public.ledger_repair_proposals;
CREATE POLICY ledger_repair_proposals_superadmin
  ON public.ledger_repair_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

DROP TRIGGER IF EXISTS update_ledger_repair_proposals_updated_at ON public.ledger_repair_proposals;
CREATE TRIGGER update_ledger_repair_proposals_updated_at
  BEFORE UPDATE ON public.ledger_repair_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.ledger_repair_proposals IS
  'Maker-checker queue for manual ledger repairs. proposed_by (admin_finance/superadmin) must differ from approved_by (superadmin). Approve posts via recordPaystackBookingSettlement / postManualFinanceAdjustment.';

-- ─── 2. Reconciliation exceptions: assignment + resolution note ──────────────

ALTER TABLE public.reconciliation_exceptions
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_assigned
  ON public.reconciliation_exceptions(assigned_to, status)
  WHERE assigned_to IS NOT NULL;

-- ─── 3. Webhook forensics ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_webhook_events_type_created
  ON public.webhook_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source_created
  ON public.webhook_events(source, created_at DESC);
