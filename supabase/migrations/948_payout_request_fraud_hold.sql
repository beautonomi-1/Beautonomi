-- Phase 7: block payout requests while an active provider_payout_holds row exists.

CREATE OR REPLACE FUNCTION public.insert_payout_request_guarded(
  p_provider_id UUID,
  p_max_available_before_reserve NUMERIC,
  p_payout JSONB
)
RETURNS SETOF public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_sum NUMERIC;
  v_dispute_reserve NUMERIC;
  v_max_available NUMERIC;
  v_amount NUMERIC;
  v_row public.payouts%ROWTYPE;
  v_lock_class INT := 8847124;
BEGIN
  PERFORM pg_advisory_xact_lock(v_lock_class, hashtext(p_provider_id::text));

  IF EXISTS (
    SELECT 1
    FROM public.provider_payout_holds h
    WHERE h.provider_id = p_provider_id
      AND h.released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PAYOUT_HELD'
      USING ERRCODE = 'check_violation';
  END IF;

  v_amount := (p_payout->>'amount')::NUMERIC;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(net_amount), 0)
  INTO v_pending_sum
  FROM public.payouts
  WHERE provider_id = p_provider_id
    AND status IN ('pending', 'processing');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_dispute_reserve
  FROM public.payment_disputes
  WHERE provider_id = p_provider_id
    AND status IN ('open', 'awaiting_bank');

  v_max_available := GREATEST(0, p_max_available_before_reserve - v_dispute_reserve);

  IF v_pending_sum + v_amount > v_max_available + 0.000001 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payouts (
    provider_id,
    payout_number,
    amount,
    currency,
    status,
    payout_method,
    payout_account_details,
    platform_fee_amount,
    platform_fee_percentage,
    net_amount,
    scheduled_at
  )
  VALUES (
    p_provider_id,
    p_payout->>'payout_number',
    v_amount,
    COALESCE(p_payout->>'currency', 'ZAR'),
    COALESCE(p_payout->>'status', 'pending'),
    COALESCE(p_payout->>'payout_method', 'bank_transfer'),
    COALESCE(p_payout->'payout_account_details', '{}'::jsonb),
    COALESCE((p_payout->>'platform_fee_amount')::NUMERIC, 0),
    COALESCE((p_payout->>'platform_fee_percentage')::NUMERIC, 0),
    COALESCE((p_payout->>'net_amount')::NUMERIC, v_amount),
    COALESCE((p_payout->>'scheduled_at')::TIMESTAMPTZ, NOW())
  )
  RETURNING * INTO v_row;

  RETURN NEXT v_row;
END;
$$;

COMMENT ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) IS
  'Inserts a pending payout after per-provider lock; blocks active fraud holds and reserves pending payouts + open disputes.';

REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) TO service_role;
