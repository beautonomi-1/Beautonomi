-- Beautonomi Database Migration
-- 023_gift_cards.sql
-- Adds gift cards + redemption/reservation tracking

-- Gift cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  initial_balance NUMERIC(10, 2) NOT NULL CHECK (initial_balance >= 0),
  balance NUMERIC(10, 2) NOT NULL CHECK (balance >= 0),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER update_gift_cards_updated_at BEFORE UPDATE ON gift_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Redemption ledger (reservation -> captured/voided)
DO $$ BEGIN
  CREATE TYPE gift_card_redemption_status AS ENUM ('reserved', 'captured', 'voided');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS gift_card_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status gift_card_redemption_status NOT NULL DEFAULT 'reserved',
  reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  captured_at TIMESTAMP WITH TIME ZONE,
  voided_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_gift_card_redemptions_booking
  ON gift_card_redemptions(booking_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemptions_gift_card_id
  ON gift_card_redemptions(gift_card_id);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemptions_user_id
  ON gift_card_redemptions(user_id) WHERE user_id IS NOT NULL;

-- Bookings: link to gift card + applied amount
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gift_card_id UUID REFERENCES gift_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_card_amount NUMERIC(10, 2) DEFAULT 0 CHECK (gift_card_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_bookings_gift_card_id ON bookings(gift_card_id) WHERE gift_card_id IS NOT NULL;

-- Enable RLS
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_redemptions ENABLE ROW LEVEL SECURITY;

-- Gift cards are redeemable by code, but validation is done server-side.
-- We keep table reads limited to authenticated users to reduce enumeration risk.
CREATE POLICY "Authenticated can read active gift cards"
  ON gift_cards FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );

CREATE POLICY "Users can view own gift card redemptions"
  ON gift_card_redemptions FOR SELECT
  USING (user_id = auth.uid());

-- Atomic reserve/capture/void via SECURITY DEFINER functions (avoids race conditions)
CREATE OR REPLACE FUNCTION reserve_gift_card_redemption(
  p_code TEXT,
  p_amount NUMERIC,
  p_booking_id UUID,
  p_currency TEXT DEFAULT 'ZAR'
)
RETURNS TABLE (gift_card_id UUID, redemption_id UUID, remaining_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gift_card gift_cards%ROWTYPE;
  v_redemption gift_card_redemptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- idempotency: if a redemption already exists for this booking, return it
  SELECT * INTO v_redemption
  FROM gift_card_redemptions
  WHERE booking_id = p_booking_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_redemption.gift_card_id, v_redemption.id, NULL::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO v_gift_card
  FROM gift_cards
  WHERE UPPER(code) = UPPER(TRIM(p_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid gift card code';
  END IF;

  IF v_gift_card.currency <> p_currency THEN
    RAISE EXCEPTION 'Gift card currency mismatch';
  END IF;

  -- reserve by decreasing available balance
  UPDATE gift_cards
    SET balance = balance - p_amount
  WHERE id = v_gift_card.id AND balance >= p_amount
  RETURNING * INTO v_gift_card;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  INSERT INTO gift_card_redemptions (
    gift_card_id, booking_id, user_id, amount, currency, status, reserved_at
  ) VALUES (
    v_gift_card.id, p_booking_id, auth.uid(), p_amount, p_currency, 'reserved', NOW()
  )
  RETURNING * INTO v_redemption;

  RETURN QUERY SELECT v_gift_card.id, v_redemption.id, v_gift_card.balance;
END;
$$;

CREATE OR REPLACE FUNCTION capture_gift_card_redemption(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_redemption gift_card_redemptions%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  -- allow service_role (webhook) OR booking owner (0-pay / cash flows)
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

  IF v_redemption.status = 'captured' THEN
    RETURN TRUE;
  END IF;

  IF v_redemption.status <> 'reserved' THEN
    RETURN FALSE;
  END IF;

  UPDATE gift_card_redemptions
    SET status = 'captured', captured_at = NOW()
  WHERE id = v_redemption.id AND status = 'reserved';

  RETURN TRUE;
END;
$$;

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

  IF v_redemption.status <> 'reserved' THEN
    RETURN FALSE;
  END IF;

  -- restore balance, then mark voided
  UPDATE gift_cards
    SET balance = balance + v_redemption.amount
  WHERE id = v_redemption.gift_card_id;

  UPDATE gift_card_redemptions
    SET status = 'voided', voided_at = NOW()
  WHERE id = v_redemption.id AND status = 'reserved';

  RETURN TRUE;
END;
$$;

-- Allow authenticated users to reserve; capture/void invoked by service role (or booking owner for non-webhook paths)
GRANT EXECUTE ON FUNCTION reserve_gift_card_redemption(TEXT, NUMERIC, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION capture_gift_card_redemption(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION void_gift_card_redemption(UUID) TO authenticated;

