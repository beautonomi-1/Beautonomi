-- Fix walk-in additional charge payment to insert into booking_payments
-- This ensures ledger parity, correct receipt amountPaid, and prevents the
-- update_booking_payment_status trigger from wiping out the total_paid.

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
    
    -- Insert into booking_payments so it counts towards total_paid and shows on receipts
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
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_transactions
    WHERE booking_id = p_booking_id
      AND transaction_type = 'walk_in_additional_charge'
      AND description = v_ledger_description
  ) THEN
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
      COALESCE(v_charge.amount, 0),
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
