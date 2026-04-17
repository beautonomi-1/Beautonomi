-- 504_booking_holds_rls_tighten.sql
-- Remediates Blocker B15 from the 2026-04 production audit.
--
-- Problem:
--   The original policies (migration 216_booking_holds.sql) allow ANY
--   anonymous / authenticated request to SELECT any hold row:
--
--     CREATE POLICY "Public can read hold by id"
--       ON booking_holds FOR SELECT USING (true);
--
--   and to UPDATE any hold that has no owner:
--
--     CREATE POLICY "Authenticated can update own hold"
--       ON booking_holds FOR UPDATE
--       USING (created_by_user_id = auth.uid() OR created_by_user_id IS NULL);
--
--   That means once RLS is the only gate — for example if a server route
--   accidentally drops down to an anon/authed Supabase client instead of
--   the service-role admin client — a guest could enumerate holds belonging
--   to other customers, or hijack an in-flight checkout by flipping the
--   `hold_status` of someone else's anonymous (created_by_user_id IS NULL)
--   hold.
--
-- Server-side reality:
--   All public booking-hold routes (/api/public/booking-holds,
--   /api/public/booking-holds/[id], /api/public/booking-holds/[id]/consume,
--   /api/public/booking-holds/[id]/release) use `getSupabaseAdmin()` and
--   therefore run as `service_role`, which bypasses RLS. Tightening these
--   policies does NOT break the public guest-checkout flow because the
--   server authenticates the caller with the hold id and never relies on
--   RLS for anonymous reads.
--
-- New policy surface (SELECT, UPDATE):
--   - service_role (server routes) — full access, unchanged.
--   - superadmin users — full read/write for support.
--   - The customer who owns the hold (`created_by_user_id = auth.uid()`).
--   - The provider whose provider_id matches the hold, evaluated via the
--     providers.user_id link (owner) OR an active provider_staff row
--     (`provider_staff.is_active = true`). This matches the pattern we use
--     on `bookings`, `provider_payment_methods`, etc.
--
-- INSERT remains open with `WITH CHECK (true)` — guests must be able to
-- create holds via /api/public/booking-holds before they ever sign in, and
-- the server already enforces provider_id, staff_id and timing invariants.

BEGIN;

-- Ensure RLS is on (216 already does this, but keep idempotent).
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- ── SELECT ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can read hold by id" ON public.booking_holds;
DROP POLICY IF EXISTS "booking_holds_select_owner_or_provider" ON public.booking_holds;

CREATE POLICY "booking_holds_select_owner_or_provider"
  ON public.booking_holds
  FOR SELECT
  USING (
    -- Service role (server routes) always reads.
    auth.role() = 'service_role'
    -- Hold owner (customer who started checkout while signed in).
    OR created_by_user_id = auth.uid()
    -- Provider owner or active staff for the hold's provider.
    OR EXISTS (
      SELECT 1
        FROM public.providers p
       WHERE p.id = booking_holds.provider_id
         AND (
           p.user_id = auth.uid()
           OR EXISTS (
             SELECT 1
               FROM public.provider_staff ps
              WHERE ps.provider_id = p.id
                AND ps.user_id = auth.uid()
                AND ps.is_active = true
           )
         )
    )
    -- Superadmin / support.
    OR EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = 'superadmin'
    )
  );

-- ── UPDATE ───────────────────────────────────────────────────────────────
-- Replace the anon-hijack-friendly policy with an explicit owner / provider
-- / superadmin policy. Service role still has its own FOR ALL policy below.
DROP POLICY IF EXISTS "Authenticated can update own hold" ON public.booking_holds;
DROP POLICY IF EXISTS "booking_holds_update_owner_or_provider" ON public.booking_holds;

CREATE POLICY "booking_holds_update_owner_or_provider"
  ON public.booking_holds
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.providers p
       WHERE p.id = booking_holds.provider_id
         AND (
           p.user_id = auth.uid()
           OR EXISTS (
             SELECT 1
               FROM public.provider_staff ps
              WHERE ps.provider_id = p.id
                AND ps.user_id = auth.uid()
                AND ps.is_active = true
           )
         )
    )
    OR EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.providers p
       WHERE p.id = booking_holds.provider_id
         AND (
           p.user_id = auth.uid()
           OR EXISTS (
             SELECT 1
               FROM public.provider_staff ps
              WHERE ps.provider_id = p.id
                AND ps.user_id = auth.uid()
                AND ps.is_active = true
           )
         )
    )
    OR EXISTS (
      SELECT 1
        FROM public.users u
       WHERE u.id = auth.uid()
         AND u.role = 'superadmin'
    )
  );

-- ── INSERT ───────────────────────────────────────────────────────────────
-- Keep open: guests must POST /api/public/booking-holds without a session.
-- The server (service_role) validates tenant/provider/staff/time before
-- inserting, and migrations 272 + 502 enforce overlap/state invariants.
DROP POLICY IF EXISTS "Public can create holds" ON public.booking_holds;
CREATE POLICY "booking_holds_insert_public"
  ON public.booking_holds
  FOR INSERT
  WITH CHECK (true);

-- ── Service role full-access (covers DELETE + expiry/reclaim cron) ───────
DROP POLICY IF EXISTS "Service role full access" ON public.booking_holds;
CREATE POLICY "booking_holds_service_role_all"
  ON public.booking_holds
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
