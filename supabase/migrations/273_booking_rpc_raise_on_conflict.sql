-- Make create_booking_with_locking reject when another booking overlaps the same staff/slot.
-- This ensures client and provider booking paths both get a consistent conflict result
-- when they race for the same slot (one wins, the other gets 409).

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
  -- If staff_id and time range provided, lock and check for conflicting bookings
  IF p_staff_id IS NOT NULL AND p_start_at IS NOT NULL AND p_end_at IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM lock_booking_services_for_update(p_staff_id, p_start_at, p_end_at);

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'BOOKING_SLOT_CONFLICT: This time slot is no longer available. Please select another time.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Insert booking (same as before)
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
    '',
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
