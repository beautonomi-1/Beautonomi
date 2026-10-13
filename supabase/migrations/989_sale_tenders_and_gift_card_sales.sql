-- Split tender legs for POS sales + gift card redemption against sales.

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  provider TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  reference TEXT,
  gift_card_id UUID REFERENCES public.gift_cards(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON public.sale_payments(sale_id);

ALTER TABLE public.gift_card_redemptions
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE public.gift_card_redemptions
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gift_card_redemptions_sale
  ON public.gift_card_redemptions(sale_id)
  WHERE sale_id IS NOT NULL;

-- Extend sales.payment_method CHECK to include split (drop/recreate if named constraint exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_payment_method_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales DROP CONSTRAINT sales_payment_method_check;
  END IF;
END $$;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'paystack', 'yoco', 'gift_card', 'other', 'split'));

CREATE OR REPLACE FUNCTION public.reserve_gift_card_redemption_for_sale(
  p_code TEXT,
  p_amount NUMERIC,
  p_sale_id UUID,
  p_currency TEXT DEFAULT 'ZAR'
)
RETURNS TABLE (gift_card_id UUID, redemption_id UUID, remaining_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift_card gift_cards%ROWTYPE;
  v_redemption gift_card_redemptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_gift_card FROM gift_cards
  WHERE UPPER(TRIM(code)) = UPPER(TRIM(p_code)) AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid gift card code';
  END IF;

  IF v_gift_card.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  SELECT * INTO v_redemption FROM gift_card_redemptions
  WHERE sale_id = p_sale_id LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_gift_card.id, v_redemption.id, v_gift_card.balance;
    RETURN;
  END IF;

  UPDATE gift_cards SET balance = balance - p_amount, updated_at = NOW()
  WHERE id = v_gift_card.id;

  INSERT INTO gift_card_redemptions (
    gift_card_id, sale_id, user_id, amount, currency, status, reserved_at
  ) VALUES (
    v_gift_card.id, p_sale_id, auth.uid(), p_amount, p_currency, 'reserved', NOW()
  )
  RETURNING * INTO v_redemption;

  RETURN QUERY SELECT v_gift_card.id, v_redemption.id, (v_gift_card.balance - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_gift_card_redemption_for_sale(p_sale_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption gift_card_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM gift_card_redemptions
  WHERE sale_id = p_sale_id AND status = 'reserved'
  LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE gift_card_redemptions
  SET status = 'captured', captured_at = NOW()
  WHERE id = v_redemption.id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_gift_card_redemption_for_sale(p_sale_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption gift_card_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM gift_card_redemptions
  WHERE sale_id = p_sale_id AND status = 'reserved'
  LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE gift_cards SET balance = balance + v_redemption.amount, updated_at = NOW()
  WHERE id = v_redemption.gift_card_id;

  UPDATE gift_card_redemptions
  SET status = 'voided', voided_at = NOW()
  WHERE id = v_redemption.id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_gift_card_redemption_for_sale(TEXT, NUMERIC, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_gift_card_redemption_for_sale(TEXT, NUMERIC, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.capture_gift_card_redemption_for_sale(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_gift_card_redemption_for_sale(UUID) TO authenticated, service_role;

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
