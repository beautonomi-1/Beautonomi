-- Repair BTN-20260724-172721-EDFD02D5 diluted cash top-up ledger.
-- 1) Link orphaned Paystack-era finance_transactions to their booking_payments row.
-- 2) Correct cash provider_earnings 32.13 → 69.00 for the R69 mark-paid top-up.
-- Superadmin revenue reports for 25 Jul shift by +36.87 (expected correction).

DO $$
DECLARE
  v_booking_id UUID := '08194473-ca0d-4e1c-8324-3222cc4dc2df';
  v_paystack_payment_id UUID := 'a733cbf5-beca-4b57-aa8f-f32c54937f3a';
  v_cash_payment_id UUID := '72eadd9a-359c-462d-86e8-44da0109461b';
  v_orphan_ids UUID[] := ARRAY[
    '5152d554-78fb-4fc8-ab3b-7a3c83a7742e'::UUID,
    'fb25e17c-c819-48b8-8169-dee5fcdce63a'::UUID,
    'dd437fd3-a7d9-4cff-8fc5-89057065d1d4'::UUID,
    'ada21fb2-24ad-4291-9655-8b43b462d07e'::UUID,
    '3bda407c-098e-4ff6-a3d6-86beb2e481fa'::UUID
  ];
  v_orphan_linked INT;
  v_cash_earnings_net NUMERIC(10, 2);
  v_total_provider_earnings NUMERIC(10, 2);
BEGIN
  -- Environment guard: this is a production data repair keyed to specific row ids.
  -- Local resets, CI and other environments do not have this booking, so skip rather
  -- than fail the migration on the verification asserts below.
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_transactions ft
    WHERE ft.booking_id = v_booking_id
      AND ft.transaction_type = 'provider_earnings'
  ) THEN
    RAISE NOTICE '816: booking % has no provider_earnings rows — skipping repair (non-production database)', v_booking_id;
    RETURN;
  END IF;

  -- A. Link Paystack-era orphans to the Paystack booking_payments row.
  UPDATE public.finance_transactions ft
  SET source_payment_id = v_paystack_payment_id
  WHERE ft.id = ANY(v_orphan_ids)
    AND ft.booking_id = v_booking_id
    AND ft.source_payment_id IS NULL;

  GET DIAGNOSTICS v_orphan_linked = ROW_COUNT;

  IF v_orphan_linked <> array_length(v_orphan_ids, 1) THEN
    RAISE NOTICE '816: linked % of % Paystack orphan rows (may already be repaired)', v_orphan_linked, array_length(v_orphan_ids, 1);
  END IF;

  -- B. Correct diluted cash provider_earnings (idempotent guard).
  UPDATE public.finance_transactions ft
  SET amount = 69.00,
      net = 69.00
  WHERE ft.booking_id = v_booking_id
    AND ft.source_payment_id = v_cash_payment_id
    AND ft.transaction_type = 'provider_earnings'
    AND ft.net BETWEEN 32.12 AND 32.14;

  -- C. Verification.
  SELECT COALESCE(SUM(ft.net), 0)
  INTO v_total_provider_earnings
  FROM public.finance_transactions ft
  WHERE ft.booking_id = v_booking_id
    AND ft.transaction_type = 'provider_earnings';

  IF ABS(v_total_provider_earnings - 129.00) > 0.01 THEN
    RAISE EXCEPTION '816 verification failed: provider_earnings total % (expected 129.00)', v_total_provider_earnings;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.finance_transactions ft
    WHERE ft.id = ANY(v_orphan_ids)
      AND ft.source_payment_id IS DISTINCT FROM v_paystack_payment_id
  ) THEN
    RAISE EXCEPTION '816 verification failed: Paystack orphan rows not linked to payment %', v_paystack_payment_id;
  END IF;

  SELECT ft.net
  INTO v_cash_earnings_net
  FROM public.finance_transactions ft
  WHERE ft.booking_id = v_booking_id
    AND ft.source_payment_id = v_cash_payment_id
    AND ft.transaction_type = 'provider_earnings'
  LIMIT 1;

  IF v_cash_earnings_net IS NULL OR ABS(v_cash_earnings_net - 69.00) > 0.01 THEN
    RAISE EXCEPTION '816 verification failed: cash provider_earnings net % (expected 69.00)', v_cash_earnings_net;
  END IF;

  RAISE NOTICE '816 repair OK: booking % provider_earnings total %, cash earnings %',
    v_booking_id, v_total_provider_earnings, v_cash_earnings_net;
END;
$$;
