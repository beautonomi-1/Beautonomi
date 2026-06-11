-- Beautonomi Database Migration
-- 671_payout_request_guarded.sql
-- Atomic provider payout request: per-provider advisory lock + reserve check inside the transaction.

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
  v_amount NUMERIC;
  v_row public.payouts%ROWTYPE;
  -- Namespace key pair so we do not collide with other advisory lock users (599 uses 8847123).
  v_lock_class INT := 8847124;
BEGIN
  PERFORM pg_advisory_xact_lock(v_lock_class, hashtext(p_provider_id::text));

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

  IF v_pending_sum + v_amount > p_max_available_before_reserve + 0.000001 THEN
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
  'Inserts a pending payout after taking a per-provider transaction advisory lock and verifying pending+processing reserve fits within max available (released earnings minus completed payouts).';

-- Service-role only: the web API validates provider identity, rate limits, minimums
-- and account readiness before calling this. Never callable from client roles.
REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.insert_payout_request_guarded(UUID, NUMERIC, JSONB) TO service_role;
