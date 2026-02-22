-- Beautonomi Database Migration
-- 027_gift_card_refund_support.sql
-- Allow reversing gift card usage when a booking is cancelled/refunded

-- Replace void function to allow voiding captured redemptions too (used for cancellations/refunds)
CREATE OR REPLACE FUNCTION void_gift_card_redemption(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_redemption gift_card_redemptions%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM bookings b WHERE b.id = p_booking_id AND b.customer_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_redemption
  FROM gift_card_redemptions
  WHERE booking_id = p_booking_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_redemption.status = 'voided' THEN
    RETURN TRUE;
  END IF;

  -- Restore balance for reserved OR captured
  IF v_redemption.status IN ('reserved', 'captured') THEN
    UPDATE gift_cards
      SET balance = balance + v_redemption.amount
    WHERE id = v_redemption.gift_card_id;

    UPDATE gift_card_redemptions
      SET status = 'voided', voided_at = NOW()
    WHERE id = v_redemption.id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

