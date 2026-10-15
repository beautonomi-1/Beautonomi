-- Serialize Zoho OAuth refresh per connection (token rate limits).

CREATE OR REPLACE FUNCTION public.with_zoho_connection_lock(p_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'p_connection_id is required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_connection_id::text));
END;
$$;

REVOKE ALL ON FUNCTION public.with_zoho_connection_lock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.with_zoho_connection_lock(uuid) TO service_role;
