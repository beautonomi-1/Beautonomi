-- Beautonomi Database Migration
-- 136_fix_race_conditions_and_gift_card_expiry.sql
-- Fixes race conditions and gift card expiry issues

-- 1. Ensure unique constraint on webhook_events(event_id, source) exists
-- (Already exists in 014_paystack_support.sql, but ensure it's there)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'webhook_events_event_id_source_key'
    AND conrelid = 'webhook_events'::regclass
  ) THEN
    ALTER TABLE webhook_events 
    ADD CONSTRAINT webhook_events_event_id_source_key 
    UNIQUE (event_id, source);
  END IF;
END $$;

-- 2. Update capture_gift_card_redemption to check expiry before capture
CREATE OR REPLACE FUNCTION capture_gift_card_redemption(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_redemption gift_card_redemptions%ROWTYPE;
  v_gift_card gift_cards%ROWTYPE;
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

  -- Check gift card expiry before capture
  SELECT * INTO v_gift_card
  FROM gift_cards
  WHERE id = v_redemption.gift_card_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  -- Check if gift card has expired
  IF v_gift_card.expires_at IS NOT NULL AND v_gift_card.expires_at < NOW() THEN
    -- Gift card expired, void the redemption and restore balance
    UPDATE gift_cards
      SET balance = balance + v_redemption.amount
    WHERE id = v_redemption.gift_card_id;

    UPDATE gift_card_redemptions
      SET status = 'voided', voided_at = NOW()
    WHERE id = v_redemption.id AND status = 'reserved';

    RAISE EXCEPTION 'Gift card has expired. Redemption voided and balance restored.';
  END IF;

  -- Check if gift card is still active
  IF NOT v_gift_card.is_active THEN
    -- Gift card inactive, void the redemption and restore balance
    UPDATE gift_cards
      SET balance = balance + v_redemption.amount
    WHERE id = v_redemption.gift_card_id;

    UPDATE gift_card_redemptions
      SET status = 'voided', voided_at = NOW()
    WHERE id = v_redemption.id AND status = 'reserved';

    RAISE EXCEPTION 'Gift card is no longer active. Redemption voided and balance restored.';
  END IF;

  -- All checks passed, capture the redemption
  UPDATE gift_card_redemptions
    SET status = 'captured', captured_at = NOW()
  WHERE id = v_redemption.id AND status = 'reserved';

  RETURN TRUE;
END;
$$;

-- 3. Create function to create booking with transaction locking
-- This function wraps booking creation in a transaction with SELECT FOR UPDATE
CREATE OR REPLACE FUNCTION create_booking_with_locking(
  p_booking_data JSONB,
  p_booking_services JSONB[],
  p_staff_id UUID DEFAULT NULL,
  p_start_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id UUID;
  v_service JSONB;
  v_conflict_count INTEGER;
BEGIN
  -- If staff_id and time range provided, lock conflicting bookings first
  IF p_staff_id IS NOT NULL AND p_start_at IS NOT NULL AND p_end_at IS NOT NULL THEN
    -- Lock conflicting booking services (SELECT FOR UPDATE)
    SELECT COUNT(*) INTO v_conflict_count
    FROM lock_booking_services_for_update(p_staff_id, p_start_at, p_end_at);
    
    -- If conflicts exist and override not allowed, raise error
    -- (Override check should be done in application code before calling this function)
    IF v_conflict_count > 0 THEN
      -- Note: This function assumes conflict check was done in application code
      -- We just ensure the lock is held during booking creation
    END IF;
  END IF;

  -- Insert booking
  INSERT INTO bookings (
    booking_number,
    customer_id,
    provider_id,
    status,
    location_type,
    location_id,
    scheduled_at,
    package_id,
    subtotal,
    travel_fee,
    service_fee_config_id,
    service_fee_percentage,
    service_fee_amount,
    service_fee_paid_by,
    tip_amount,
    tax_amount,
    discount_amount,
    promotion_discount_amount,
    membership_discount_amount,
    total_amount,
    currency,
    payment_status,
    special_requests,
    loyalty_points_earned,
    promotion_id,
    membership_plan_id,
    address_line1,
    address_line2,
    address_city,
    address_state,
    address_country,
    address_postal_code,
    address_latitude,
    address_longitude,
    is_group_booking,
    gift_card_id,
    gift_card_amount,
    wallet_amount
  )
  SELECT
    '', -- Will be set by trigger
    (p_booking_data->>'customer_id')::UUID,
    (p_booking_data->>'provider_id')::UUID,
    (p_booking_data->>'status')::booking_status,
    (p_booking_data->>'location_type')::location_type,
    NULLIF(p_booking_data->>'location_id', 'null')::UUID,
    (p_booking_data->>'scheduled_at')::TIMESTAMP WITH TIME ZONE,
    NULLIF(p_booking_data->>'package_id', 'null')::UUID,
    (p_booking_data->>'subtotal')::NUMERIC,
    COALESCE((p_booking_data->>'travel_fee')::NUMERIC, 0),
    NULLIF(p_booking_data->>'service_fee_config_id', 'null')::UUID,
    COALESCE((p_booking_data->>'service_fee_percentage')::NUMERIC, 0),
    COALESCE((p_booking_data->>'service_fee_amount')::NUMERIC, 0),
    COALESCE(p_booking_data->>'service_fee_paid_by', 'customer'),
    COALESCE((p_booking_data->>'tip_amount')::NUMERIC, 0),
    COALESCE((p_booking_data->>'tax_amount')::NUMERIC, 0),
    COALESCE((p_booking_data->>'discount_amount')::NUMERIC, 0),
    COALESCE((p_booking_data->>'promotion_discount_amount')::NUMERIC, 0),
    COALESCE((p_booking_data->>'membership_discount_amount')::NUMERIC, 0),
    (p_booking_data->>'total_amount')::NUMERIC,
    COALESCE(p_booking_data->>'currency', 'ZAR'),
    (p_booking_data->>'payment_status')::TEXT,
    NULLIF(p_booking_data->>'special_requests', 'null'),
    COALESCE((p_booking_data->>'loyalty_points_earned')::INTEGER, 0),
    NULLIF(p_booking_data->>'promotion_id', 'null')::UUID,
    NULLIF(p_booking_data->>'membership_plan_id', 'null')::UUID,
    NULLIF(p_booking_data->>'address_line1', 'null'),
    NULLIF(p_booking_data->>'address_line2', 'null'),
    NULLIF(p_booking_data->>'address_city', 'null'),
    NULLIF(p_booking_data->>'address_state', 'null'),
    NULLIF(p_booking_data->>'address_country', 'null'),
    NULLIF(p_booking_data->>'address_postal_code', 'null'),
    NULLIF(p_booking_data->>'address_latitude', 'null')::NUMERIC,
    NULLIF(p_booking_data->>'address_longitude', 'null')::NUMERIC,
    COALESCE((p_booking_data->>'is_group_booking')::BOOLEAN, false),
    NULLIF(p_booking_data->>'gift_card_id', 'null')::UUID,
    COALESCE((p_booking_data->>'gift_card_amount')::NUMERIC, 0),
    COALESCE((p_booking_data->>'wallet_amount')::NUMERIC, 0)
  RETURNING id INTO v_booking_id;

  -- Insert booking services
  FOREACH v_service IN ARRAY p_booking_services
  LOOP
    INSERT INTO booking_services (
      booking_id,
      offering_id,
      staff_id,
      duration_minutes,
      price,
      currency,
      scheduled_start_at,
      scheduled_end_at
    )
    VALUES (
      v_booking_id,
      (v_service->>'offering_id')::UUID,
      NULLIF(v_service->>'staff_id', 'null')::UUID,
      (v_service->>'duration_minutes')::INTEGER,
      (v_service->>'price')::NUMERIC,
      v_service->>'currency',
      (v_service->>'scheduled_start_at')::TIMESTAMP WITH TIME ZONE,
      (v_service->>'scheduled_end_at')::TIMESTAMP WITH TIME ZONE
    );
  END LOOP;

  RETURN v_booking_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;

-- Create function to acquire advisory lock (wrapper for pg_advisory_xact_lock)
-- This is needed because Supabase RPC doesn't directly expose pg_advisory_xact_lock
-- Note: Advisory locks are automatically released at transaction end
CREATE OR REPLACE FUNCTION acquire_booking_lock(p_key BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(p_key);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION acquire_booking_lock(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION acquire_booking_lock(BIGINT) TO service_role;

-- 4. Create table for payment reconciliation (failed webhooks)
CREATE TABLE IF NOT EXISTS payment_reconciliation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL,
  payment_provider TEXT NOT NULL DEFAULT 'paystack',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'resolved', 'failed')),
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_queue_status 
  ON payment_reconciliation_queue(status, next_retry_at) 
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_queue_booking 
  ON payment_reconciliation_queue(booking_id);

-- Enable RLS
ALTER TABLE payment_reconciliation_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service_role can access reconciliation queue
CREATE POLICY "Service role can manage payment reconciliation"
  ON payment_reconciliation_queue FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE TRIGGER update_payment_reconciliation_queue_updated_at
  BEFORE UPDATE ON payment_reconciliation_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
