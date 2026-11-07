-- Stickiness: last-visit memory on provider_clients (does not touch update_provider_client_stats)

ALTER TABLE provider_clients
  ADD COLUMN IF NOT EXISTS last_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_offering_name TEXT,
  ADD COLUMN IF NOT EXISTS last_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS service_note TEXT;

COMMENT ON COLUMN provider_clients.last_booking_id IS 'Most recent completed visit booking id for this client pair';
COMMENT ON COLUMN provider_clients.service_note IS 'Provider look/service note; separate from CRM notes';

CREATE OR REPLACE FUNCTION update_provider_client_last_visit(p_booking_id UUID)
RETURNS void AS $$
DECLARE
  b RECORD;
  v_visit_ts TIMESTAMPTZ;
  v_offering_name TEXT;
  v_staff_name TEXT;
BEGIN
  SELECT id, provider_id, customer_id, status, completed_at, scheduled_at
  INTO b
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF b.status::TEXT <> 'completed' OR b.customer_id IS NULL THEN
    RETURN;
  END IF;

  v_visit_ts := COALESCE(b.completed_at, b.scheduled_at);

  IF EXISTS (
    SELECT 1
    FROM bookings other
    WHERE other.provider_id = b.provider_id
      AND other.customer_id = b.customer_id
      AND other.status::TEXT = 'completed'
      AND other.id <> b.id
      AND COALESCE(other.completed_at, other.scheduled_at) > v_visit_ts
  ) THEN
    RETURN;
  END IF;

  SELECT o.title, ps.name
  INTO v_offering_name, v_staff_name
  FROM booking_services bs
  LEFT JOIN offerings o ON o.id = bs.offering_id
  LEFT JOIN provider_staff ps ON ps.id = bs.staff_id
  WHERE bs.booking_id = p_booking_id
  ORDER BY bs.scheduled_start_at ASC NULLS LAST, bs.created_at ASC
  LIMIT 1;

  INSERT INTO provider_clients (
    provider_id,
    customer_id,
    last_booking_id,
    last_offering_name,
    last_staff_name
  )
  VALUES (
    b.provider_id,
    b.customer_id,
    b.id,
    v_offering_name,
    v_staff_name
  )
  ON CONFLICT (provider_id, customer_id)
  DO UPDATE SET
    last_booking_id = EXCLUDED.last_booking_id,
    last_offering_name = EXCLUDED.last_offering_name,
    last_staff_name = EXCLUDED.last_staff_name,
    updated_at = NOW();
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_provider_client_last_visit_from_booking()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status::TEXT = 'completed' AND NEW.customer_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status::TEXT <> 'completed'))
    THEN
      PERFORM update_provider_client_last_visit(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_provider_client_last_visit_from_booking_service()
RETURNS TRIGGER AS $$
DECLARE
  b_status TEXT;
BEGIN
  SELECT status::TEXT INTO b_status FROM bookings WHERE id = NEW.booking_id;
  IF b_status = 'completed' THEN
    PERFORM update_provider_client_last_visit(NEW.booking_id);
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_booking_completed_last_visit ON bookings;
CREATE TRIGGER on_booking_completed_last_visit
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trg_provider_client_last_visit_from_booking();

DROP TRIGGER IF EXISTS on_booking_service_insert_last_visit ON booking_services;
CREATE TRIGGER on_booking_service_insert_last_visit
  AFTER INSERT ON booking_services
  FOR EACH ROW
  EXECUTE FUNCTION trg_provider_client_last_visit_from_booking_service();
