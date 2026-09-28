-- Flip reserved redemption status before restoring balance (avoid double-credit races).

CREATE OR REPLACE FUNCTION public.void_gift_card_redemption(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_redemption public.gift_card_redemptions%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.bookings b WHERE b.id = p_booking_id AND b.customer_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.gift_card_redemptions
  SET status = 'voided', voided_at = NOW()
  WHERE booking_id = p_booking_id
    AND status = 'reserved'
  RETURNING * INTO v_redemption;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.gift_card_redemptions
      WHERE booking_id = p_booking_id AND status = 'voided'
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  UPDATE public.gift_cards
  SET balance = balance + v_redemption.amount
  WHERE id = v_redemption.gift_card_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_gift_card_redemption_for_order(p_product_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_redemption public.gift_card_redemptions%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.product_orders po
      WHERE po.id = p_product_order_id AND po.customer_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.gift_card_redemptions
  SET status = 'voided', voided_at = NOW()
  WHERE product_order_id = p_product_order_id
    AND status IN ('reserved', 'captured')
  RETURNING * INTO v_redemption;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.gift_card_redemptions
      WHERE product_order_id = p_product_order_id AND status = 'voided'
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  UPDATE public.gift_cards
  SET balance = balance + v_redemption.amount
  WHERE id = v_redemption.gift_card_id;

  RETURN TRUE;
END;
$$;
