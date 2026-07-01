-- Migration 718: Fix resource capacity enforcement
--
-- 1. Drop the overly strict UNIQUE(resource_id, scheduled_start_at, scheduled_end_at)
--    constraint on booking_resources. The uniqueness rule prevents a resource with
--    capacity > 1 from ever being booked by two bookings at the same time, contradicting
--    the capacity model. Replace with a plain non-unique index for query performance.
--
-- 2. Rewrite check_resource_availability() to be capacity-aware and use the same
--    canonical status filter as lock_booking_resources_for_update (migration 475:
--    excludes cancelled + no_show; 'failed' is NOT a booking_status enum value).
--
-- 3. Rewrite the resource conflict block inside create_booking_with_locking() to be
--    capacity-aware: only reject when concurrent non-cancelled bookings >= capacity.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop uniqueness constraint; keep the index for lookup performance
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE booking_resources
  DROP CONSTRAINT IF EXISTS booking_resources_resource_id_scheduled_start_at_scheduled_en_key;

-- The original migration created the constraint with a system-generated name.
-- Also try dropping by the constraint name pattern Postgres auto-generates.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'booking_resources'
    AND c.contype = 'u'
    AND array_length(c.conkey, 1) = 3;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE booking_resources DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

-- Ensure a non-unique index exists for the same columns (may already exist from migration 099)
CREATE INDEX IF NOT EXISTS idx_booking_resources_resource_time
  ON booking_resources(resource_id, scheduled_start_at, scheduled_end_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rewrite check_resource_availability() — capacity-aware + correct status filter
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_resource_availability(
    p_resource_id UUID,
    p_start_at TIMESTAMP WITH TIME ZONE,
    p_end_at TIMESTAMP WITH TIME ZONE,
    p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_capacity      INTEGER;
    v_overlap_count INTEGER;
BEGIN
    -- Fetch the resource's capacity (default 1 when not explicitly set)
    SELECT COALESCE(capacity, 1) INTO v_capacity
    FROM resources
    WHERE id = p_resource_id;

    IF NOT FOUND THEN
        RETURN FALSE; -- resource does not exist → not available
    END IF;

    -- Count active overlapping allocations.
    -- Mirrors the CANONICAL status filter in lock_booking_resources_for_update
    -- (migration 475): excludes cancelled + no_show only. NOTE: the booking_status
    -- enum has never included 'failed' (see migration 475) — using that literal
    -- against the enum column raises 22P02, so it must NOT be listed here.
    SELECT COUNT(*) INTO v_overlap_count
    FROM booking_resources br
    JOIN bookings b ON b.id = br.booking_id
    WHERE br.resource_id = p_resource_id
      AND br.scheduled_start_at < p_end_at
      AND br.scheduled_end_at > p_start_at
      AND b.status NOT IN ('cancelled', 'no_show')
      AND (p_exclude_booking_id IS NULL OR br.booking_id != p_exclude_booking_id);

    -- Available when the number of concurrent bookings is below capacity
    RETURN v_overlap_count < v_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rewrite create_booking_with_locking() resource conflict block
--    to be capacity-aware (count concurrent allocations vs resources.capacity).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);

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
  v_service         JSONB;
  v_conflict_count  INTEGER;
  v_redeemed        BOOLEAN;
  v_resource_id     UUID;
  v_res_overlap     INTEGER;
  v_res_capacity    INTEGER;
BEGIN
  -- Staff conflict lock (unchanged)
  IF p_staff_id IS NOT NULL AND p_start_at IS NOT NULL AND p_end_at IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM lock_booking_services_for_update(p_staff_id, p_start_at, p_end_at);

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'BOOKING_SLOT_CONFLICT: This time slot is no longer available. Please select another time.'
        USING ERRCODE = 'P0001';
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

-- Re-grant permissions (same as migration 455)
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_with_locking(JSONB, JSONB[], UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, UUID, UUID[], TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO service_role;
