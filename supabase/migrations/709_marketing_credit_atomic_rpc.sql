-- Atomic, race-safe marketing credit debit/credit.
--
-- Previously the balance read, balance update, and ledger insert were three
-- separate statements in application code, so two concurrent sends could both
-- read the same balance and overspend. These SECURITY DEFINER functions perform
-- the whole operation in one transaction with a row lock (FOR UPDATE) on the
-- provider's credit row, and rely on the unique idempotency_key index for
-- exactly-once accounting. They also let server code that runs under a
-- user-scoped (authenticated) Supabase client mutate the service-role-only
-- credit tables safely — the function body runs as the definer.

-- ---------------------------------------------------------------------------
-- Debit: spend prepaid credit (included first, then purchased).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.debit_marketing_credit(
  p_provider_id uuid,
  p_amount_zar numeric,
  p_reason text,
  p_idempotency_key text,
  p_channel text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_queue_row_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included numeric;
  v_purchased numeric;
  v_remaining numeric;
  v_from_included numeric;
  v_balance_after numeric;
  v_existing numeric;
BEGIN
  IF p_amount_zar IS NULL OR p_amount_zar <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount must be positive');
  END IF;

  -- Idempotency: a prior identical debit already happened — return its result.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_existing
    FROM marketing_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'balance_after', v_existing, 'idempotent', true);
    END IF;
  END IF;

  INSERT INTO provider_marketing_credits (provider_id)
  VALUES (p_provider_id)
  ON CONFLICT (provider_id) DO NOTHING;

  SELECT included_balance_zar, purchased_balance_zar
    INTO v_included, v_purchased
  FROM provider_marketing_credits
  WHERE provider_id = p_provider_id
  FOR UPDATE;

  v_included := COALESCE(v_included, 0);
  v_purchased := COALESCE(v_purchased, 0);

  IF v_included + v_purchased < p_amount_zar THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient');
  END IF;

  v_remaining := p_amount_zar;
  v_from_included := LEAST(v_included, v_remaining);
  v_included := v_included - v_from_included;
  v_remaining := v_remaining - v_from_included;
  IF v_remaining > 0 THEN
    v_purchased := v_purchased - v_remaining;
  END IF;
  v_balance_after := v_included + v_purchased;

  UPDATE provider_marketing_credits
  SET included_balance_zar = v_included,
      purchased_balance_zar = v_purchased,
      updated_at = now()
  WHERE provider_id = p_provider_id;

  INSERT INTO marketing_credit_ledger (
    provider_id, delta_zar, reason, channel, category,
    campaign_id, queue_row_id, idempotency_key, balance_after, metadata
  ) VALUES (
    p_provider_id, -p_amount_zar, p_reason, p_channel, p_category,
    p_campaign_id, p_queue_row_id, p_idempotency_key, v_balance_after, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'balance_after', v_balance_after);
EXCEPTION
  WHEN unique_violation THEN
    -- A concurrent identical debit won the idempotency race; return its result.
    SELECT balance_after INTO v_existing
    FROM marketing_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'balance_after', COALESCE(v_existing, 0), 'idempotent', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Credit: add to purchased balance (top-ups, refunds, admin adjustments).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_marketing_credit(
  p_provider_id uuid,
  p_amount_zar numeric,
  p_reason text,
  p_idempotency_key text DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included numeric;
  v_purchased numeric;
  v_balance_after numeric;
  v_existing numeric;
BEGIN
  IF p_amount_zar IS NULL OR p_amount_zar <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'amount must be positive');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT balance_after INTO v_existing
    FROM marketing_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'balance_after', v_existing, 'idempotent', true);
    END IF;
  END IF;

  INSERT INTO provider_marketing_credits (provider_id)
  VALUES (p_provider_id)
  ON CONFLICT (provider_id) DO NOTHING;

  SELECT included_balance_zar, purchased_balance_zar
    INTO v_included, v_purchased
  FROM provider_marketing_credits
  WHERE provider_id = p_provider_id
  FOR UPDATE;

  v_included := COALESCE(v_included, 0);
  v_purchased := COALESCE(v_purchased, 0) + p_amount_zar;
  v_balance_after := v_included + v_purchased;

  UPDATE provider_marketing_credits
  SET purchased_balance_zar = v_purchased,
      updated_at = now()
  WHERE provider_id = p_provider_id;

  INSERT INTO marketing_credit_ledger (
    provider_id, delta_zar, reason, channel, category,
    campaign_id, idempotency_key, balance_after, metadata
  ) VALUES (
    p_provider_id, p_amount_zar, p_reason, p_channel, p_category,
    p_campaign_id, p_idempotency_key, v_balance_after, COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('ok', true, 'balance_after', v_balance_after);
EXCEPTION
  WHEN unique_violation THEN
    SELECT balance_after INTO v_existing
    FROM marketing_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'balance_after', COALESCE(v_existing, 0), 'idempotent', true);
END;
$$;

REVOKE ALL ON FUNCTION public.debit_marketing_credit(uuid, numeric, text, text, text, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_marketing_credit(uuid, numeric, text, text, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_marketing_credit(uuid, numeric, text, text, text, text, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_marketing_credit(uuid, numeric, text, text, text, text, uuid, jsonb) TO authenticated, service_role;
