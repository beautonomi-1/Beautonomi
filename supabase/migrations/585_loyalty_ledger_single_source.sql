-- Single source of truth: loyalty_points_ledger + append RPC + completion trigger on ledger.
-- Milestone awards move from loyalty_point_transactions to loyalty_points_ledger.
-- get_user_loyalty_balance delegates to get_customer_available_points.

BEGIN;

-- Normalize any legacy-incorrect signs before enforcing CHECK
UPDATE public.loyalty_points_ledger
SET points_amount = -ABS(points_amount)
WHERE transaction_type IN ('redeemed', 'expired')
  AND points_amount > 0;

UPDATE public.loyalty_points_ledger
SET points_amount = ABS(points_amount)
WHERE transaction_type IN ('earned', 'bonus')
  AND points_amount < 0;

ALTER TABLE public.loyalty_points_ledger
  DROP CONSTRAINT IF EXISTS loyalty_points_ledger_sign_chk;

ALTER TABLE public.loyalty_points_ledger
  ADD CONSTRAINT loyalty_points_ledger_sign_chk CHECK (
    (transaction_type IN ('earned', 'bonus') AND points_amount >= 0)
    OR (transaction_type IN ('redeemed', 'expired') AND points_amount <= 0)
    OR (transaction_type = 'adjusted')
  );

COMMENT ON TABLE public.loyalty_points_ledger IS
  'Canonical loyalty ledger. Balance = GREATEST(0, SUM(points_amount)) over non-expired rows; '
  'balance_after is informational (maintained by append_loyalty_ledger_entry).';

-- Dedupe earned-per-booking before enforcing uniqueness.
-- Legacy `loyalty_point_transactions` could double-record a single completion;
-- after the 584 backfill those mirrors land here as multiple 'earned' rows for the
-- same (customer_id, booking_id). We keep the earliest row and downgrade later
-- duplicates to 'adjusted' so each customer's net balance is preserved (the sign
-- CHECK allows any sign for 'adjusted', and milestone awards only fire on INSERT).
WITH duplicate_earns AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY customer_id, booking_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.loyalty_points_ledger
  WHERE booking_id IS NOT NULL
    AND transaction_type = 'earned'
)
UPDATE public.loyalty_points_ledger l
SET
  transaction_type = 'adjusted',
  description = COALESCE(NULLIF(BTRIM(l.description), ''), 'Points transaction')
                || ' (deduped duplicate earn for booking)',
  metadata = COALESCE(l.metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'deduped_from', 'earned',
                  'reason', 'legacy duplicate earn for booking; downgraded to adjusted to preserve balance'
                )
FROM duplicate_earns d
WHERE l.id = d.id
  AND d.rn > 1;

-- At most one earned row per booking per customer (booking-linked earn)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_loyalty_ledger_earned_per_booking
  ON public.loyalty_points_ledger (customer_id, booking_id)
  WHERE booking_id IS NOT NULL
    AND transaction_type = 'earned';

-- Atomic append with per-customer transaction lock (correct balance_after under concurrency)
CREATE OR REPLACE FUNCTION public.append_loyalty_ledger_entry(
  p_customer_id uuid,
  p_transaction_type text,
  p_points_amount integer,
  p_booking_id uuid,
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_sum integer;
  v_new_balance integer;
  v_desc text := COALESCE(NULLIF(BTRIM(p_description), ''), 'Points transaction');
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'append_loyalty_ledger_entry: customer_id required';
  END IF;
  IF p_transaction_type IS NULL
    OR p_transaction_type NOT IN ('earned', 'redeemed', 'expired', 'adjusted', 'bonus') THEN
    RAISE EXCEPTION 'append_loyalty_ledger_entry: invalid transaction_type %', p_transaction_type;
  END IF;
  IF p_points_amount IS NULL THEN
    RAISE EXCEPTION 'append_loyalty_ledger_entry: points_amount required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text), 0);

  SELECT COALESCE(SUM(points_amount), 0)::integer INTO v_sum
  FROM public.loyalty_points_ledger
  WHERE customer_id = p_customer_id
    AND (expires_at IS NULL OR expires_at > now());

  v_new_balance := GREATEST(0, v_sum + p_points_amount);

  INSERT INTO public.loyalty_points_ledger (
    id,
    customer_id,
    transaction_type,
    points_amount,
    balance_after,
    booking_id,
    description,
    metadata,
    expires_at
  )
  VALUES (
    v_id,
    p_customer_id,
    p_transaction_type,
    p_points_amount,
    v_new_balance,
    p_booking_id,
    v_desc,
    COALESCE(p_metadata, '{}'::jsonb),
    p_expires_at
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_loyalty_ledger_entry(uuid, text, integer, uuid, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_loyalty_ledger_entry(uuid, text, integer, uuid, text, jsonb, timestamptz) TO service_role;

-- Legacy balance RPC now reads the ledger (keeps external callers working until table drop)
CREATE OR REPLACE FUNCTION public.get_user_loyalty_balance(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.get_customer_available_points(p_user_id);
$$;

-- Booking completion: award earn into ledger only (idempotent per booking)
CREATE OR REPLACE FUNCTION public.award_loyalty_points_on_booking_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_amount numeric;
  v_points_per_unit numeric := 1;
  v_points_earned integer := 0;
BEGIN
  IF NEW.status <> 'completed' OR COALESCE(OLD.status, '') = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.loyalty_points_ledger l
    WHERE l.booking_id = NEW.id
      AND l.transaction_type = 'earned'
  ) THEN
    RETURN NEW;
  END IF;

  v_base_amount := COALESCE(NEW.subtotal, 0);
  IF v_base_amount <= 0 THEN
    v_base_amount := GREATEST(
      0,
      COALESCE(NEW.total_amount, 0)
        - COALESCE(NEW.tax_amount, 0)
        - COALESCE(NEW.service_fee_amount, 0)
        - COALESCE(NEW.tip_amount, 0)
        - COALESCE(NEW.travel_fee, 0)
        + COALESCE(NEW.discount_amount, 0)
    );
  END IF;

  IF v_base_amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT lr.points_per_currency_unit
  INTO v_points_per_unit
  FROM public.loyalty_rules lr
  WHERE lr.is_active = true
    AND (lr.currency = NEW.currency OR NEW.currency IS NULL)
  ORDER BY lr.effective_from DESC
  LIMIT 1;

  IF v_points_per_unit IS NULL THEN
    SELECT lr.points_per_currency_unit
    INTO v_points_per_unit
    FROM public.loyalty_rules lr
    WHERE lr.is_active = true
    ORDER BY lr.effective_from DESC
    LIMIT 1;
  END IF;

  v_points_per_unit := COALESCE(v_points_per_unit, 1);
  v_points_earned := FLOOR(v_base_amount * v_points_per_unit);

  IF v_points_earned <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public.append_loyalty_ledger_entry(
    NEW.customer_id,
    'earned',
    v_points_earned,
    NEW.id,
    CONCAT('Points earned for completed booking ', COALESCE(NEW.booking_number::text, NEW.id::text)),
    '{}'::jsonb,
    NULL
  );

  UPDATE public.bookings
  SET loyalty_points_earned = v_points_earned
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Milestone awards: fire on ledger inserts (positive earn / bonus / positive adjustment only)
CREATE OR REPLACE FUNCTION public.award_loyalty_milestones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_wallet_id uuid;
  v_wallet_currency text;
  m record;
BEGIN
  IF NOT (
    NEW.transaction_type IN ('earned', 'bonus')
    OR (NEW.transaction_type = 'adjusted' AND NEW.points_amount > 0)
  ) THEN
    RETURN NEW;
  END IF;

  v_balance := public.get_customer_available_points(NEW.customer_id);

  SELECT id, currency INTO v_wallet_id, v_wallet_currency
  FROM public.user_wallets
  WHERE user_id = NEW.customer_id
  LIMIT 1
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.user_wallets (user_id, currency)
    VALUES (NEW.customer_id, 'ZAR')
    RETURNING id, currency INTO v_wallet_id, v_wallet_currency;
  END IF;

  FOR m IN
    SELECT *
    FROM public.loyalty_milestones
    WHERE is_active = true
      AND points_threshold <= v_balance
    ORDER BY points_threshold ASC
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.loyalty_milestone_awards
      WHERE user_id = NEW.customer_id
        AND milestone_id = m.id
    ) THEN
      INSERT INTO public.loyalty_milestone_awards (
        user_id,
        milestone_id,
        awarded_points_balance,
        reward_type,
        reward_amount,
        reward_currency,
        metadata
      )
      VALUES (
        NEW.customer_id,
        m.id,
        v_balance,
        m.reward_type,
        m.reward_amount,
        m.reward_currency,
        jsonb_build_object(
          'source_tx_id', NEW.id,
          'source_booking_id', NEW.booking_id,
          'source_reference_type', CASE WHEN NEW.booking_id IS NOT NULL THEN 'booking' ELSE 'ledger' END,
          'source_reference_id', COALESCE(NEW.booking_id::text, NEW.metadata ->> 'reference_id')
        )
      );

      IF m.reward_type = 'wallet_credit' AND m.reward_amount > 0 THEN
        UPDATE public.user_wallets SET balance = balance + m.reward_amount WHERE id = v_wallet_id;
        INSERT INTO public.wallet_transactions (
          wallet_id,
          type,
          amount,
          description,
          reference_id,
          reference_type,
          tenant_id
        )
        VALUES (
          v_wallet_id,
          'credit',
          m.reward_amount,
          CONCAT('Loyalty milestone reward: ', m.name),
          m.id,
          'loyalty_milestone',
          public.tenant_default_za_id()
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.award_loyalty_milestones() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_loyalty_points_award_milestones ON public.loyalty_point_transactions;
DROP TRIGGER IF EXISTS on_loyalty_ledger_award_milestones ON public.loyalty_points_ledger;
CREATE TRIGGER on_loyalty_ledger_award_milestones
AFTER INSERT ON public.loyalty_points_ledger
FOR EACH ROW
EXECUTE FUNCTION public.award_loyalty_milestones();

COMMIT;
