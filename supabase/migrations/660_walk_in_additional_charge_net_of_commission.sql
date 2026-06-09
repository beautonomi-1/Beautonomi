-- 660: recognize walk-in mid-visit additional charges NET-of-commission
--
-- Root cause (money-correctness QA, follow-up to 659):
-- `record_walk_in_additional_charge_payment` (migration 580) writes the single
-- `walk_in_additional_charge` recognition row DIRECTLY (it is the authoritative writer of
-- that row, NOT the trigger — see 580 lines 167-190). It stored net = gross (commission 0).
-- Migration 659 then made the trigger `create_finance_ledger_from_payment()`:
--   (a) SKIP the duplicate provider_earnings row for these settlements, and
--   (b) STILL post the platform-commission `payment` row when commission is enabled
--       (gross > 0 and percentage > 0), exactly like walk-in BASE service.
--
-- Net effect for a COMMISSION-ENABLED tenant: the platform booked commission via the
-- `payment` row, yet the provider's recognized revenue counted the
-- `walk_in_additional_charge` row at GROSS — overstating provider income by the commission.
-- Walk-in BASE service recognizes provider income NET-of-commission (the provider_earnings
-- row stores commission_base - commission), so add-ons and base service were inconsistent
-- and the add-on figure was untruthful for commission-enabled tenants.
--
-- Fix (this migration): redefine the RPC so the `walk_in_additional_charge` row stores
-- net = gross - <platform commission for this charge>, while `amount` stays gross and the
-- commission column stays 0 (mirroring how provider_earnings models recognition — commission
-- lives on the sibling `payment` row, not on the recognition row).
--
-- Commission-rounding parity WITHOUT duplication / drift:
--   We do NOT recompute commission here. The booking_payments INSERT fires the AFTER INSERT
--   trigger `create_finance_ledger_from_payment()` (migration 169 trigger, body redefined in
--   659) synchronously, which posts the platform `payment` row keyed by
--   source_payment_id = <the booking_payments id>. We capture that id and READ BACK the exact
--   commission the trigger computed, then store net = gross - that commission. This guarantees
--   gross = walk_in.net + payment.commission to the cent, so every recognized-revenue surface
--   (recognizedRevenue / computeDashboardEarningsMix / payments-summary providerNetActivity /
--   sales-history provider_net) reconciles with sales-history's
--   gross = provider_net + commission + platform_fee + tax + discount_contra invariant.
--
-- Guardrails preserved:
--   * Commission-DISABLED tenants: the trigger posts no `payment` row, the read-back is 0,
--     so net = gross (unchanged behaviour — provider keeps 100%).
--   * `amount` stays gross so the immutable shadow-ledger replay (migration 510, which posts
--     the walk_in journal from `amount` = cash-in-hand) is byte-for-byte unchanged — no
--     reconciliation drift.
--   * `walk_in_additional_charge` is recognition-only and is NOT in the payout-balance query
--     (available-payout-balance.ts), so payout numbers are unaffected.
--   * The online-paystack add-on path (additional_charge_payment + its provider_earnings) and
--     every non-walk-in path are untouched. The rest of the 580 body is preserved verbatim.

CREATE OR REPLACE FUNCTION public.record_walk_in_additional_charge_payment(
  p_booking_id uuid,
  p_charge_id uuid,
  p_provider_id uuid,
  p_tenant_id uuid,
  p_payment_provider text,
  p_payment_method text,
  p_reference text,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking record;
  v_charge record;
  v_ledger_description text;
  v_payment_tx_id uuid;
  v_existing_payment record;
  v_existing_charge_payment_id uuid;
  v_charge_was_paid boolean;
  -- 660: the booking_payments row id created by this settlement (when the charge is newly
  -- paid). Used to read back the platform commission the AFTER INSERT trigger computed for
  -- THIS payment so the recognition row can be stored net-of-commission with zero drift.
  v_booking_payment_id uuid;
  v_walk_in_commission numeric(10,2);
  v_walk_in_net numeric(10,2);
BEGIN
  SELECT id, provider_id, tenant_id, total_amount, total_paid
    INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND provider_id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found for provider';
  END IF;

  SELECT id, booking_id, description, amount, status
    INTO v_charge
  FROM public.additional_charges
  WHERE id = p_charge_id
    AND booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Additional charge not found';
  END IF;

  v_charge_was_paid := v_charge.status = 'paid';
  v_ledger_description := 'Walk-in additional charge ' || p_charge_id::text || ': ' || COALESCE(v_charge.description, 'Add-on');

  IF v_charge_was_paid THEN
    SELECT id
      INTO v_existing_charge_payment_id
    FROM public.payment_transactions
    WHERE booking_id = p_booking_id
      AND metadata ->> 'additional_charge_id' = p_charge_id::text
      AND metadata ->> 'kind' = 'walk_in_additional_charge'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_existing_charge_payment_id IS NULL THEN
    INSERT INTO public.payment_transactions (
      booking_id,
      reference,
      amount,
      fees,
      net_amount,
      status,
      provider,
      transaction_type,
      metadata,
      created_at
    ) VALUES (
      p_booking_id,
      p_reference,
      COALESCE(v_charge.amount, 0),
      0,
      COALESCE(v_charge.amount, 0),
      'success',
      p_payment_provider,
      'charge',
      jsonb_build_object(
        'kind', 'walk_in_additional_charge',
        'additional_charge_id', p_charge_id::text,
        'payment_method', p_payment_method,
        'source', 'provider_mark_paid',
        'created_by', p_created_by::text
      ),
      now()
    )
    ON CONFLICT (provider, reference) DO NOTHING
    RETURNING id INTO v_payment_tx_id;
  END IF;

  IF v_payment_tx_id IS NULL AND v_existing_charge_payment_id IS NULL THEN
    SELECT id, booking_id, metadata
      INTO v_existing_payment
    FROM public.payment_transactions
    WHERE provider = p_payment_provider
      AND reference = p_reference;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment reference conflict could not be resolved';
    END IF;

    IF v_existing_payment.booking_id IS DISTINCT FROM p_booking_id
       OR COALESCE(v_existing_payment.metadata ->> 'additional_charge_id', '') <> p_charge_id::text THEN
      RAISE EXCEPTION 'Payment reference already belongs to a different transaction';
    END IF;
  END IF;

  IF NOT v_charge_was_paid THEN
    -- Update booking total_amount.
    -- We do NOT update total_paid here because inserting into booking_payments
    -- will fire the update_booking_payment_status trigger which computes it correctly.
    UPDATE public.bookings
    SET total_amount = COALESCE(total_amount, 0) + COALESCE(v_charge.amount, 0),
        updated_at = now()
    WHERE id = p_booking_id;

    UPDATE public.additional_charges
    SET status = 'paid',
        paid_at = now(),
        updated_at = now()
    WHERE id = p_charge_id;

    -- Insert into booking_payments so it counts towards total_paid and shows on receipts.
    -- This INSERT fires create_finance_ledger_from_payment() (AFTER INSERT, migration 169
    -- trigger; body redefined in 659): it posts the platform-commission `payment` row when
    -- commission is enabled and skips the duplicate provider_earnings row for this settlement.
    -- 660: capture the new row id so we can read back that commission below.
    INSERT INTO public.booking_payments (
      booking_id,
      tenant_id,
      amount,
      payment_method,
      payment_provider,
      payment_provider_id,
      payment_provider_data,
      status,
      notes,
      created_by
    ) VALUES (
      p_booking_id,
      COALESCE(v_booking.tenant_id, p_tenant_id),
      COALESCE(v_charge.amount, 0),
      p_payment_method,
      p_payment_provider,
      p_reference,
      jsonb_build_object(
        'additional_charge_id', p_charge_id::text,
        'source', 'walk_in'
      ),
      'completed',
      'Walk-in additional charge payment',
      p_created_by
    )
    RETURNING id INTO v_booking_payment_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_transactions
    WHERE booking_id = p_booking_id
      AND transaction_type = 'walk_in_additional_charge'
      AND description = v_ledger_description
  ) THEN
    -- 660: recognize NET-of-commission. Read back the exact platform commission the trigger
    -- already booked for THIS payment (source_payment_id = the booking_payments row id) so the
    -- recognition row reconciles to the cent with the platform `payment` row. When commission
    -- is disabled (no `payment` row) the read-back is 0 and net == gross (provider keeps 100%).
    v_walk_in_commission := 0;
    IF v_booking_payment_id IS NOT NULL THEN
      SELECT COALESCE(ft.commission, 0)
        INTO v_walk_in_commission
      FROM public.finance_transactions ft
      WHERE ft.source_payment_id = v_booking_payment_id
        AND ft.transaction_type = 'payment'
      ORDER BY ft.created_at DESC
      LIMIT 1;
    END IF;
    IF v_walk_in_commission IS NULL THEN
      v_walk_in_commission := 0;
    END IF;

    v_walk_in_net := GREATEST(COALESCE(v_charge.amount, 0) - v_walk_in_commission, 0);

    INSERT INTO public.finance_transactions (
      booking_id,
      provider_id,
      tenant_id,
      transaction_type,
      amount,
      fees,
      commission,
      net,
      description,
      created_at
    ) VALUES (
      p_booking_id,
      p_provider_id,
      COALESCE(v_booking.tenant_id, p_tenant_id),
      'walk_in_additional_charge',
      COALESCE(v_charge.amount, 0),
      0,
      0,
      v_walk_in_net,
      v_ledger_description,
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'charge_id', p_charge_id,
    'charge_was_paid', v_charge_was_paid,
    'payment_reference', p_reference,
    'payment_transaction_id', v_payment_tx_id,
    'amount', COALESCE(v_charge.amount, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_walk_in_additional_charge_payment(uuid, uuid, uuid, uuid, text, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.record_walk_in_additional_charge_payment(uuid, uuid, uuid, uuid, text, text, text, uuid) IS
  'Atomically settles a walk-in mid-visit additional charge: payment_transactions (charge) + '
  'booking_payments (fires create_finance_ledger_from_payment) + the single '
  'walk_in_additional_charge recognition row. 660: that recognition row is stored '
  'NET-of-commission (net = gross - the platform commission booked on the sibling payment row) '
  'so commission-enabled provider revenue matches walk-in base service; amount stays gross so '
  'the shadow-ledger journal and payout balance are unchanged.';
