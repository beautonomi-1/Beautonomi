-- Card-machine refunds that staff must complete on the machine (Yoco has no refund API).
--
-- A cancelled booking refunded "back to card" on Yoco leaves an obligation the
-- platform cannot execute itself. It is stored as a `pending` booking_refunds row
-- with machine_refund_provider = 'yoco' so it is visible (booking detail,
-- reconciliation report) and blocks double refunds via the in-person cap, while
-- the ledger / payment-status triggers (completed-only) stay untouched until the
-- refund is recorded or confirmed by the Yoco refund webhook.
--
-- `cancelled` closes an obligation without moving money (superseded by a webhook
-- reversal, or withdrawn by staff in favour of another refund method).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.booking_refunds'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      AND pg_get_constraintdef(con.oid) ILIKE '%pending%'
  LOOP
    EXECUTE format('ALTER TABLE public.booking_refunds DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.booking_refunds
  ADD CONSTRAINT booking_refunds_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'));

ALTER TABLE public.booking_refunds
  ADD COLUMN IF NOT EXISTS machine_refund_provider text
    CHECK (machine_refund_provider IS NULL OR machine_refund_provider IN ('yoco')),
  ADD COLUMN IF NOT EXISTS awaiting_machine_since timestamptz;

COMMENT ON COLUMN public.booking_refunds.machine_refund_provider IS
  'Card machine the refund is (or was) performed on by staff, outside any refund API. pending + yoco = awaiting a machine refund.';
COMMENT ON COLUMN public.booking_refunds.awaiting_machine_since IS
  'When the machine refund obligation was created (e.g. booking cancelled back to card).';

CREATE INDEX IF NOT EXISTS booking_refunds_awaiting_machine_idx
  ON public.booking_refunds (booking_id, awaiting_machine_since)
  WHERE status = 'pending' AND machine_refund_provider IS NOT NULL;
