-- F21: Symmetric refund handling.
--
-- Every refund posted to booking_refunds must produce a reversing (negative) row in
-- finance_transactions. Prior to this migration the webhook handler
-- (apps/web/src/app/api/payments/webhook/_handlers/refund-events.ts) attempted to do this
-- in application code, but only on the Paystack path and only when a payment_transactions
-- lookup succeeded. Admin-initiated refunds and Yoco refunds left the ledger silent.

CREATE OR REPLACE FUNCTION public.create_finance_ledger_from_booking_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_booking RECORD;
  v_tenant_id UUID;
  v_provider_id UUID;
  v_description TEXT;
BEGIN
  -- Only write for completed refunds (pending/failed refunds do not move money).
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if a refund row already exists for this booking_refunds id.
  IF EXISTS (
    SELECT 1 FROM public.finance_transactions
    WHERE source_refund_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id, provider_id, tenant_id, booking_number
    INTO v_booking
    FROM public.bookings
   WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'create_finance_ledger_from_booking_refund: booking % not found, skipping.', NEW.booking_id;
    RETURN NEW;
  END IF;

  v_tenant_id := v_booking.tenant_id;
  v_provider_id := v_booking.provider_id;
  v_description := format('Refund for booking %s (%s)',
    COALESCE(v_booking.booking_number, v_booking.id::text),
    COALESCE(NEW.reason, 'no reason supplied'));

  INSERT INTO public.finance_transactions (
    tenant_id,
    booking_id,
    provider_id,
    source_payment_id,
    source_refund_id,
    transaction_type,
    amount,
    fees,
    commission,
    net,
    description,
    created_at
  ) VALUES (
    v_tenant_id,
    NEW.booking_id,
    v_provider_id,
    NEW.payment_id,            -- links back to booking_payments; nullable if cash/wallet.
    NEW.id,
    'refund',
    NEW.amount,
    0,
    0,
    -NEW.amount,               -- reversing entry: negative net so reports sum correctly.
    v_description,
    COALESCE(NEW.updated_at, NEW.created_at, NOW())
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- source_refund_id column for traceability + idempotency.
ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS source_refund_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_finance_transactions_source_refund
  ON public.finance_transactions (source_refund_id)
  WHERE source_refund_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_refunds'
  ) THEN
    DROP TRIGGER IF EXISTS trg_booking_refunds_to_finance_ledger ON public.booking_refunds;
    CREATE TRIGGER trg_booking_refunds_to_finance_ledger
      AFTER INSERT OR UPDATE OF status ON public.booking_refunds
      FOR EACH ROW EXECUTE FUNCTION public.create_finance_ledger_from_booking_refund();
  END IF;
END $$;
