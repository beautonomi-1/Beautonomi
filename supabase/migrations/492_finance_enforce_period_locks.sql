-- F22: Period-close enforcement.
-- Once an admin locks a period via financial_period_locks, reject any new
-- finance_transactions / booking_payments writes whose created_at falls inside the locked range.

-- enforce_finance_period_lock: fires on rows that carry tenant_id directly.
-- booking_refunds does not carry tenant_id, so it uses the sibling function
-- enforce_finance_period_lock_via_booking() below, which derives tenant_id
-- from the parent booking.

CREATE OR REPLACE FUNCTION public.enforce_finance_period_lock()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_row RECORD;
  v_tenant UUID;
  v_effective_at TIMESTAMPTZ;
BEGIN
  v_tenant := NEW.tenant_id;
  v_effective_at := COALESCE(NEW.created_at, NOW());

  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, period_start, period_end
    INTO v_lock_row
    FROM public.financial_period_locks
   WHERE tenant_id = v_tenant
     AND v_effective_at::date BETWEEN period_start AND period_end
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Financial period % – % is locked for tenant %. Refusing % on %',
      v_lock_row.period_start, v_lock_row.period_end, v_tenant, TG_OP, TG_TABLE_NAME
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.enforce_finance_period_lock_via_booking()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_row RECORD;
  v_tenant UUID;
  v_effective_at TIMESTAMPTZ;
BEGIN
  v_effective_at := COALESCE(NEW.created_at, NOW());

  SELECT b.tenant_id INTO v_tenant
    FROM public.bookings b
   WHERE b.id = NEW.booking_id
   LIMIT 1;

  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, period_start, period_end
    INTO v_lock_row
    FROM public.financial_period_locks
   WHERE tenant_id = v_tenant
     AND v_effective_at::date BETWEEN period_start AND period_end
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Financial period % – % is locked for tenant %. Refusing % on %',
      v_lock_row.period_start, v_lock_row.period_end, v_tenant, TG_OP, TG_TABLE_NAME
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_transactions'
  ) THEN
    DROP TRIGGER IF EXISTS trg_finance_transactions_period_lock ON public.finance_transactions;
    CREATE TRIGGER trg_finance_transactions_period_lock
      BEFORE INSERT OR UPDATE ON public.finance_transactions
      FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_period_lock();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_payments'
  ) THEN
    DROP TRIGGER IF EXISTS trg_booking_payments_period_lock ON public.booking_payments;
    CREATE TRIGGER trg_booking_payments_period_lock
      BEFORE INSERT OR UPDATE ON public.booking_payments
      FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_period_lock();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_refunds'
  ) THEN
    DROP TRIGGER IF EXISTS trg_booking_refunds_period_lock ON public.booking_refunds;
    CREATE TRIGGER trg_booking_refunds_period_lock
      BEFORE INSERT OR UPDATE ON public.booking_refunds
      FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_period_lock_via_booking();
  END IF;
END $$;
