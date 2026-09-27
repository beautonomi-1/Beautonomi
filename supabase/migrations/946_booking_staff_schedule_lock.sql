-- Phase 2: per-staff advisory lock serializes create + reschedule for the same schedule key.

CREATE OR REPLACE FUNCTION public.lock_staff_schedule(
  p_staff_id UUID,
  p_provider_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    8847300,
    hashtext(COALESCE(p_staff_id, p_provider_id)::text)
  );
END;
$$;

COMMENT ON FUNCTION public.lock_staff_schedule(UUID, UUID) IS
  'Transaction-scoped advisory lock keyed by staff or solo provider to prevent double-booking races.';

REVOKE ALL ON FUNCTION public.lock_staff_schedule(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_staff_schedule(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.lock_staff_schedule(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lock_staff_schedule(UUID, UUID) TO service_role;

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
  v_booking_id      UUID;
  v_provider_id     UUID;
  v_active_staff    INTEGER;
  v_service         JSONB;
  v_conflict_count  INTEGER;
  v_redeemed        BOOLEAN;
  v_resource_id     UUID;
  v_res_overlap     INTEGER;
  v_res_capacity    INTEGER;
BEGIN
  v_provider_id := (p_booking_data->>'provider_id')::UUID;

  IF p_start_at IS NOT NULL AND p_end_at IS NOT NULL THEN
    PERFORM public.lock_staff_schedule(p_staff_id, v_provider_id);

    IF p_staff_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_conflict_count
      FROM lock_booking_services_for_update(p_staff_id, p_start_at, p_end_at);

      IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'BOOKING_SLOT_CONFLICT: This time slot is no longer available. Please select another time.'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      SELECT COUNT(*)::INTEGER INTO v_active_staff
      FROM public.provider_staff ps
      WHERE ps.provider_id = v_provider_id
        AND COALESCE(ps.is_active, true) = true
        AND ps.deleted_at IS NULL;

      IF COALESCE(v_active_staff, 0) = 0 THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM public.booking_services bs
        INNER JOIN public.bookings b ON b.id = bs.booking_id
        WHERE b.provider_id = v_provider_id
          AND bs.staff_id IS NULL
          AND b.status NOT IN ('cancelled', 'no_show')
          AND bs.scheduled_start_at < p_end_at
          AND bs.scheduled_end_at > p_start_at;

        IF v_conflict_count > 0 THEN
          RAISE EXCEPTION 'BOOKING_SLOT_CONFLICT: This time slot is no longer available. Please select another time.'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Resource conflict lock — capacity-aware.
  -- `lock_booking_resources_for_update` (migration 475) both (a) acquires a
  -- FOR UPDATE lock on every overlapping row and (b) applies the canonical
  -- status filter (excludes cancelled + no_show). We reuse it as the single
  -- source of truth for the count so the lock set and the count never drift.
  -- Only raise when the concurrent count reaches the resource's capacity.
  IF p_resource_ids IS NOT NULL AND p_resource_start_at IS NOT NULL AND p_resource_end_at IS NOT NULL THEN
    FOREACH v_resource_id IN ARRAY p_resource_ids
    LOOP
      -- Fetch capacity (default 1 when unset)
      SELECT COALESCE(capacity, 1) INTO v_res_capacity
      FROM resources
      WHERE id = v_resource_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'RESOURCE_NOT_FOUND: Resource % does not exist.', v_resource_id
          USING ERRCODE = 'P0001';
      END IF;

      -- Lock + count overlapping active allocations in one call.
      SELECT COUNT(*) INTO v_res_overlap
      FROM lock_booking_resources_for_update(v_resource_id, p_resource_start_at, p_resource_end_at);

      IF v_res_overlap >= v_res_capacity THEN
        RAISE EXCEPTION 'RESOURCE_CONFLICT: Required resource % is not available at this time (at capacity).', v_resource_id
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
    payment_option,
    hold_id,
    recurring_series_id
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
    COALESCE(p_booking_data->>'payment_option', 'full'),
    NULLIF(p_booking_data->>'hold_id', 'null')::UUID,
    NULLIF(p_booking_data->>'recurring_series_id', 'null')::UUID
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

GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;

CREATE OR REPLACE FUNCTION public.check_reschedule_slot_conflict(
  p_booking_id    uuid,
  p_staff_id      uuid,
  p_provider_id   uuid,
  p_new_start     timestamptz,
  p_total_minutes integer
)
RETURNS TABLE (conflict boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_end          timestamptz := p_new_start + make_interval(mins => GREATEST(p_total_minutes, 0));
  v_conflict     boolean := false;
BEGIN
  PERFORM public.lock_staff_schedule(p_staff_id, p_provider_id);

  -- Overlap on same staff, excluding this booking.
  SELECT EXISTS (
    SELECT 1
      FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id
     WHERE bs.staff_id = p_staff_id
       AND b.id <> p_booking_id
       AND b.status NOT IN ('cancelled', 'no_show', 'completed')
       AND bs.scheduled_start_at < v_end
       AND bs.scheduled_end_at   > p_new_start
  ) INTO v_conflict;

  -- Also consider approved staff time-off (day-level) overlapping the slot.
  IF NOT v_conflict THEN
    IF EXISTS (
      SELECT 1
        FROM public.staff_time_off sto
       WHERE sto.staff_id = p_staff_id
         AND sto.status = 'approved'
         AND sto.start_date <= v_end::date
         AND sto.end_date   >= p_new_start::date
    ) THEN
      v_conflict := true;
    END IF;
  END IF;

  conflict := v_conflict;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_reschedule_slot_conflict(
  uuid, uuid, uuid, timestamptz, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_reschedule_slot_conflict(
  uuid, uuid, uuid, timestamptz, integer
) TO service_role;
