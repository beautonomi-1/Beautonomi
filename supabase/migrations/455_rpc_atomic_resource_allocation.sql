-- Extend create_booking_with_locking to optionally allocate resources
-- inside the same serializable transaction, eliminating the TOCTOU race
-- between the availability check and booking_resources insert.

DROP FUNCTION IF EXISTS create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID);

CREATE OR REPLACE FUNCTION create_booking_with_locking(
  p_booking_data JSONB,
  p_booking_services JSONB[],
  p_staff_id UUID DEFAULT NULL,
  p_start_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_entitlement_id UUID DEFAULT NULL,
  p_entitlement_customer_id UUID DEFAULT NULL,
  p_resource_ids UUID[] DEFAULT NULL,
  p_resource_start_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_resource_end_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id UUID;
  v_service JSONB;
  v_conflict_count INTEGER;
  v_redeemed BOOLEAN;
  v_resource_id UUID;
  v_res_conflict INTEGER;
BEGIN
  -- Staff conflict lock (existing behaviour)
  IF p_staff_id IS NOT NULL AND p_start_at IS NOT NULL AND p_end_at IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM lock_booking_services_for_update(p_staff_id, p_start_at, p_end_at);

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'BOOKING_SLOT_CONFLICT: This time slot is no longer available. Please select another time.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Resource conflict lock — check each resource for overlapping reservations
  IF p_resource_ids IS NOT NULL AND p_resource_start_at IS NOT NULL AND p_resource_end_at IS NOT NULL THEN
    FOREACH v_resource_id IN ARRAY p_resource_ids
    LOOP
      SELECT COUNT(*) INTO v_res_conflict
      FROM lock_booking_resources_for_update(v_resource_id, p_resource_start_at, p_resource_end_at);

      IF v_res_conflict > 0 THEN
        RAISE EXCEPTION 'RESOURCE_CONFLICT: Required resource % is not available at this time.', v_resource_id
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- Insert the booking row
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
    wallet_amount,
    customer_package_entitlement_id,
    deposit_required,
    deposit_percentage,
    deposit_amount,
    payment_option
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
    COALESCE(p_booking_data->>'payment_status', 'pending')::payment_status,
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
    COALESCE((p_booking_data->>'wallet_amount')::NUMERIC, 0),
    p_entitlement_id,
    COALESCE((p_booking_data->>'deposit_required')::BOOLEAN, false),
    NULLIF(p_booking_data->>'deposit_percentage', 'null')::NUMERIC,
    NULLIF(p_booking_data->>'deposit_amount', 'null')::NUMERIC,
    COALESCE(p_booking_data->>'payment_option', 'full')
  RETURNING id INTO v_booking_id;

  -- Insert booking_services
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

  -- Insert booking_resources atomically if resource IDs were provided
  IF p_resource_ids IS NOT NULL AND p_resource_start_at IS NOT NULL AND p_resource_end_at IS NOT NULL THEN
    FOREACH v_resource_id IN ARRAY p_resource_ids
    LOOP
      INSERT INTO booking_resources (booking_id, resource_id, scheduled_start_at, scheduled_end_at)
      VALUES (v_booking_id, v_resource_id, p_resource_start_at, p_resource_end_at);
    END LOOP;
  END IF;

  -- Redeem package entitlement if provided
  IF p_entitlement_id IS NOT NULL THEN
    IF p_entitlement_customer_id IS NULL THEN
      RAISE EXCEPTION 'ENTITLEMENT_REDEEM_FAILED: Missing customer for entitlement redeem'
        USING ERRCODE = 'P0001';
    END IF;
    v_redeemed := public.redeem_customer_package_entitlement(p_entitlement_id, p_entitlement_customer_id);
    IF v_redeemed IS NOT TRUE THEN
      RAISE EXCEPTION 'ENTITLEMENT_REDEEM_FAILED: Could not redeem package session (no balance or invalid entitlement)'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN v_booking_id;
END;
$$;

-- Grant permissions on the new signature (10 params)
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;
