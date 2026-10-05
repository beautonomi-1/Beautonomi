-- Public availability reads `availability_blocks` via RLS policies that call
-- is_provider_staff(). Security-advisor hardening revoked PUBLIC execute and
-- re-granted authenticated only. Guests (anon) then get 42501 and calendar
-- blocks are silently dropped. Service-role must keep EXECUTE so the booking
-- engine's admin client can evaluate those policies when BYPASSRLS is off.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('is_provider_staff', 'is_provider_owner', 'can_access_provider')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.ident);
  END LOOP;
END $$;
