-- Align booking number generation with UNIQUE (tenant_id, booking_number) and
-- reduce duplicate-key failures when several participant bookings commit in
-- parallel for the same tenant (same clock second + same 4-digit slice).
--
-- Provider direct inserts use empty booking_number + trigger; concurrent
-- sessions previously could both pass the global EXISTS check before either
-- committed. We take a per-tenant transaction advisory lock and add UUID
-- entropy to the suffix.

DROP TRIGGER IF EXISTS on_booking_created_set_number ON public.bookings;
DROP FUNCTION IF EXISTS public.set_booking_number();
DROP FUNCTION IF EXISTS public.generate_booking_number();

CREATE OR REPLACE FUNCTION public.generate_booking_number(p_tenant_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text := 'BTN';
  v_ts text;
  v_booking_number text;
  v_exists boolean;
  -- Namespace key pair so we do not collide with other advisory lock users.
  v_lock_class int := 8847123;
  v_lock_key int;
BEGIN
  v_lock_key := hashtext(coalesce(p_tenant_id::text, '_booking_number_global_'));
  PERFORM pg_advisory_xact_lock(v_lock_class, v_lock_key);

  LOOP
    v_ts := to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS');
    v_booking_number := v_prefix || '-' || v_ts || '-' ||
      upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

    IF p_tenant_id IS NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.bookings b WHERE b.booking_number = v_booking_number)
      INTO v_exists;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.booking_number = v_booking_number
          AND b.tenant_id = p_tenant_id
      )
      INTO v_exists;
    END IF;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_booking_number;
END;
$$;

COMMENT ON FUNCTION public.generate_booking_number(uuid) IS
  'Generates BTN-… booking numbers; tenant-scoped collision check matches bookings_tenant_id_booking_number_key; uses advisory xact lock + UUID entropy for concurrent inserts.';

CREATE OR REPLACE FUNCTION public.set_booking_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_number IS NULL OR NEW.booking_number = '' THEN
    NEW.booking_number := public.generate_booking_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_booking_created_set_number
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.booking_number IS NULL OR NEW.booking_number = '')
  EXECUTE FUNCTION public.set_booking_number();
