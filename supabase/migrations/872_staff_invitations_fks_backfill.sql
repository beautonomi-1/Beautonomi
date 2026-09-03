-- ============================================================================
-- Migration 872: Staff invitations, FK hardening, staff_services backfill,
-- over-cap grace, staff finance settings, tip top-up allocation, templates
-- Part F (staff capability end to end) — closes remaining F1/F2/F4/F5 gaps.
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. provider_staff columns (deleted_at exists from 497; ensure + over-cap grace)
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_staff
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS over_cap_grace_until TIMESTAMPTZ;

COMMENT ON COLUMN public.provider_staff.over_cap_grace_until IS
  'Set when the staff row was auto-deactivated because the provider downgraded below its staff cap. Owner has until this time to pick who stays; invites are blocked while active count > cap.';

CREATE INDEX IF NOT EXISTS idx_provider_staff_over_cap_grace
  ON public.provider_staff(provider_id, over_cap_grace_until)
  WHERE over_cap_grace_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. staff_invitations — first-class invite records (810 token columns on
--    provider_staff stay for backward compatibility with shipped mobile builds).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.provider_staff(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  phone TEXT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_invitations_token_hash
  ON public.staff_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_provider_status
  ON public.staff_invitations(provider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_staff
  ON public.staff_invitations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email
  ON public.staff_invitations(lower(email));

COMMENT ON TABLE public.staff_invitations IS
  'Staff invite lifecycle (pending|accepted|revoked|expired). token_hash = sha256(invite token); the raw token is only in the join link.';

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

-- Owners and managers (manage_team) of the provider can read/manage invites.
DROP POLICY IF EXISTS staff_invitations_manage ON public.staff_invitations;
CREATE POLICY staff_invitations_manage ON public.staff_invitations
  FOR ALL
  USING (public.staff_has_manage_team(provider_id))
  WITH CHECK (public.staff_has_manage_team(provider_id));

-- The invited staff member (once linked) can read their own invite rows.
DROP POLICY IF EXISTS staff_invitations_self_read ON public.staff_invitations;
CREATE POLICY staff_invitations_self_read ON public.staff_invitations
  FOR SELECT
  USING (
    staff_id IN (SELECT id FROM public.provider_staff WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS update_staff_invitations_updated_at ON public.staff_invitations;
CREATE TRIGGER update_staff_invitations_updated_at
  BEFORE UPDATE ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: pending 810-style invites become staff_invitations rows so the
-- revoke endpoint and the accept matrix work for invites sent before 872.
-- token_hash = sha256 hex of the UUID token (matches hashStaffInviteToken in
-- apps/web/src/lib/provider/staff-invitations.ts). Needs pgcrypto's digest().
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgcrypto not created here (%); assuming it is already available', SQLERRM;
END $$;

INSERT INTO public.staff_invitations (
  provider_id, staff_id, email, phone, token_hash, status, channels, expires_at, accepted_at, created_at
)
SELECT
  ps.provider_id,
  ps.id,
  COALESCE(ps.email, ''),
  ps.phone,
  encode(digest(ps.invite_token::text, 'sha256'), 'hex'),
  CASE
    WHEN ps.invite_accepted_at IS NOT NULL THEN 'accepted'
    WHEN ps.invite_token_expires_at IS NOT NULL AND ps.invite_token_expires_at < now() THEN 'expired'
    ELSE 'pending'
  END,
  ARRAY['email']::TEXT[],
  COALESCE(ps.invite_token_expires_at, COALESCE(ps.invite_sent_at, now()) + INTERVAL '14 days'),
  ps.invite_accepted_at,
  COALESCE(ps.invite_sent_at, now())
FROM public.provider_staff ps
WHERE ps.invite_token IS NOT NULL
  AND ps.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.staff_invitations si
    WHERE si.token_hash = encode(digest(ps.invite_token::text, 'sha256'), 'hex')
  );

-- ---------------------------------------------------------------------------
-- 2. FK hardening: provider_staff is soft-deleted now, so nothing should
--    cascade-wipe money/time records if a row is ever hard-deleted.
--
--    Tables with `REFERENCES provider_staff(id) ON DELETE CASCADE` today:
--      booking_tip_allocations.staff_id      (220)  money   -> RESTRICT
--      staff_shifts.staff_id                 (069)  time    -> RESTRICT
--      staff_time_cards.staff_id             (090)  time    -> RESTRICT
--      provider_pay_run_items.staff_id       (218)  money   -> RESTRICT
--      provider_staff_commission_tiers.staff_id (219) money config -> RESTRICT
--      staff_schedules.staff_id              (202)  config  -> keep CASCADE
--      staff_time_off.staff_id               (202)  config  -> keep CASCADE
--      staff_days_off.staff_id               (090)  config  -> keep CASCADE
--      staff_services.staff_id               (202)  config  -> keep CASCADE
--      provider_staff_locations.staff_id     (138)  config  -> keep CASCADE
--      availability_blocks.staff_id          (005)  nullable block -> keep CASCADE
--      time_blocks.staff_id                  (069/202) nullable block -> keep CASCADE
--    staff_earnings_lines.staff_id is already RESTRICT (866).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t RECORD;
  v_con RECORD;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'booking_tip_allocations',
      'staff_shifts',
      'staff_time_cards',
      'provider_pay_run_items',
      'provider_staff_commission_tiers'
    ]) AS table_name
  LOOP
    IF to_regclass('public.' || t.table_name) IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class fref ON fref.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND rel.relname = t.table_name
        AND fref.relname = 'provider_staff'
        AND a.attname = 'staff_id'
        AND c.confdeltype = 'c'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t.table_name, v_con.conname);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (staff_id) REFERENCES public.provider_staff(id) ON DELETE RESTRICT',
        t.table_name, v_con.conname
      );
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Backfill staff_services from legacy provider_staff arrays
--    (assigned_service_ids / service_ids). Write paths no longer touch the
--    arrays; staff_services is the single source of eligibility.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has_assigned BOOLEAN;
  v_has_service_ids BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_staff' AND column_name = 'assigned_service_ids'
  ) INTO v_has_assigned;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_staff' AND column_name = 'service_ids'
  ) INTO v_has_service_ids;

  IF v_has_assigned THEN
    EXECUTE $sql$
      INSERT INTO public.staff_services (staff_id, offering_id, provider_id)
      SELECT DISTINCT ps.id, x.offering_id::uuid, ps.provider_id
      FROM public.provider_staff ps
      CROSS JOIN LATERAL unnest(ps.assigned_service_ids) AS x(offering_id)
      JOIN public.offerings o ON o.id = x.offering_id::uuid AND o.provider_id = ps.provider_id
      WHERE ps.assigned_service_ids IS NOT NULL
        AND array_length(ps.assigned_service_ids, 1) > 0
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;

  IF v_has_service_ids THEN
    EXECUTE $sql$
      INSERT INTO public.staff_services (staff_id, offering_id, provider_id)
      SELECT DISTINCT ps.id, x.offering_id::uuid, ps.provider_id
      FROM public.provider_staff ps
      CROSS JOIN LATERAL unnest(ps.service_ids) AS x(offering_id)
      JOIN public.offerings o ON o.id = x.offering_id::uuid AND o.provider_id = ps.provider_id
      WHERE ps.service_ids IS NOT NULL
        AND array_length(ps.service_ids, 1) > 0
      ON CONFLICT DO NOTHING
    $sql$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Provider setting: share cancellation / no-show fees with assigned staff
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_settings
  ADD COLUMN IF NOT EXISTS staff_share_cancellation_fee BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.provider_settings.staff_share_cancellation_fee IS
  'When true, cancellation/no-show fee provider earnings post cancellation_fee_share staff_earnings_lines at the staff commission rate.';

-- ---------------------------------------------------------------------------
-- 5. Pay runs: store payment reference + paid_at (payroll stays out of the GL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.provider_pay_runs
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. staff_earnings_lines: reversal/adjustment kinds, reason metadata,
--    employee-only RLS (owners/managers see all)
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_earnings_lines
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.staff_earnings_lines DROP CONSTRAINT IF EXISTS staff_earnings_lines_kind_check;
ALTER TABLE public.staff_earnings_lines
  ADD CONSTRAINT staff_earnings_lines_kind_check
  CHECK (kind IN ('commission', 'tip', 'cancellation_fee_share', 'reversal', 'adjustment'));

ALTER TABLE public.staff_earnings_lines DROP CONSTRAINT IF EXISTS staff_earnings_lines_rate_source_check;
ALTER TABLE public.staff_earnings_lines
  ADD CONSTRAINT staff_earnings_lines_rate_source_check
  CHECK (rate_source IN ('staff', 'offering_override', 'tier', 'backfill', 'reassign', 'manual'));

COMMENT ON COLUMN public.staff_earnings_lines.reason IS
  'Human-readable reason shown in My earnings for reversal/adjustment lines (e.g. Reassigned to another stylist, Refund clawback).';

CREATE OR REPLACE FUNCTION public.staff_can_view_all_earnings_lines(p_provider_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM providers p WHERE p.id = p_provider_id AND p.user_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM provider_staff ps
    WHERE ps.provider_id = p_provider_id
      AND ps.user_id = auth.uid()
      AND ps.is_active = TRUE
      AND ps.deleted_at IS NULL
      AND (
        ps.role IN ('owner', 'manager')
        OR ps.is_admin = TRUE
        OR COALESCE((ps.permissions->>'manage_team')::boolean, FALSE) = TRUE
        OR COALESCE((ps.permissions->>'manage_finance')::boolean, FALSE) = TRUE
        OR COALESCE((ps.permissions->>'view_reports')::boolean, FALSE) = TRUE
      )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS staff_earnings_lines_provider_read ON public.staff_earnings_lines;
DROP POLICY IF EXISTS staff_earnings_lines_manager_read ON public.staff_earnings_lines;
CREATE POLICY staff_earnings_lines_manager_read ON public.staff_earnings_lines
  FOR SELECT USING (public.staff_can_view_all_earnings_lines(provider_id));

DROP POLICY IF EXISTS staff_earnings_lines_self_read ON public.staff_earnings_lines;
CREATE POLICY staff_earnings_lines_self_read ON public.staff_earnings_lines
  FOR SELECT USING (
    staff_id IN (
      SELECT id FROM public.provider_staff
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Tip allocation trigger (220): allocate top-ups instead of skipping when
--    allocations already exist. Recomputes target allocation from the sum of
--    all tip finance_transactions on the booking, so a second tip adds the
--    delta and a re-run is idempotent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tip_allocations_on_tip_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_distribute boolean;
    v_total_price numeric := 0;
    v_total_tips numeric := 0;
    v_staff_price numeric;
    v_staff_record record;
BEGIN
    IF NEW.transaction_type != 'tip' OR NEW.amount IS NULL OR NEW.amount <= 0 OR NEW.booking_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(pt.distribute_to_staff, false) INTO v_distribute
    FROM provider_tip_settings pt
    WHERE pt.provider_id = NEW.provider_id;

    IF NOT COALESCE(v_distribute, false) THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(bs.price), 0) INTO v_total_price
    FROM booking_services bs
    WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0;

    IF v_total_price <= 0 THEN
        RETURN NEW;
    END IF;

    -- Total tips so far on this booking (includes NEW; AFTER INSERT trigger).
    SELECT COALESCE(SUM(ft.amount), 0) INTO v_total_tips
    FROM finance_transactions ft
    WHERE ft.booking_id = NEW.booking_id
      AND ft.transaction_type = 'tip'
      AND ft.amount > 0;

    IF v_total_tips <= 0 THEN
        RETURN NEW;
    END IF;

    FOR v_staff_record IN
        SELECT bs.staff_id, SUM(bs.price) AS staff_total
        FROM booking_services bs
        WHERE bs.booking_id = NEW.booking_id AND bs.staff_id IS NOT NULL AND bs.price > 0
        GROUP BY bs.staff_id
    LOOP
        v_staff_price := ROUND(v_total_tips * v_staff_record.staff_total / v_total_price, 2);
        IF v_staff_price > 0 THEN
            INSERT INTO booking_tip_allocations (booking_id, staff_id, amount)
            VALUES (NEW.booking_id, v_staff_record.staff_id, v_staff_price)
            ON CONFLICT (booking_id, staff_id) DO UPDATE SET amount = EXCLUDED.amount;
        END IF;
    END LOOP;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error creating tip allocations for booking %: %', NEW.booking_id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_tip_allocations_on_tip_transaction IS
  '872: recomputes booking_tip_allocations from the running tip total so second tip top-ups are allocated (220 skipped them).';

-- ---------------------------------------------------------------------------
-- 8. Notification templates for staff_* events (global, tenant_id IS NULL)
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_templates (key, title, body, channels, variables, url, enabled, description)
SELECT v.key, v.title, v.body, v.channels, v.variables, v.url, true, v.description
FROM (VALUES
  ('staff_booking_assigned', 'New appointment assigned',
   '{{customer_name}} — {{service_name}} on {{booking_date}} at {{booking_time}} was assigned to you.',
   ARRAY['push']::TEXT[], ARRAY['customer_name','service_name','booking_date','booking_time','booking_id']::TEXT[],
   '/provider/bookings/{{booking_id}}', 'Sent to the staff member when a booking line is assigned to them.'),
  ('staff_booking_reassigned', 'Appointment reassigned',
   '{{service_name}} on {{booking_date}} at {{booking_time}} was reassigned {{direction}}.',
   ARRAY['push']::TEXT[], ARRAY['service_name','booking_date','booking_time','direction','booking_id']::TEXT[],
   '/provider/bookings/{{booking_id}}', 'Sent to both the previous and new staff member when a booking line changes hands.'),
  ('staff_booking_cancelled', 'Appointment cancelled',
   '{{customer_name}} — {{service_name}} on {{booking_date}} at {{booking_time}} was cancelled.',
   ARRAY['push']::TEXT[], ARRAY['customer_name','service_name','booking_date','booking_time','booking_id']::TEXT[],
   '/provider/bookings/{{booking_id}}', 'Sent to the assigned staff member when their booking is cancelled.'),
  ('staff_schedule_changed', 'Your schedule changed',
   'Your working hours for {{day_of_week}} are now {{start_time}}–{{end_time}}.',
   ARRAY['push']::TEXT[], ARRAY['day_of_week','start_time','end_time']::TEXT[],
   '/provider/staff/schedule', 'Sent to the staff member when an owner/manager changes their shifts or hours.'),
  ('staff_time_off_requested', 'Time off request',
   '{{staff_name}} requested time off {{start_date}} – {{end_date}}.',
   ARRAY['push']::TEXT[], ARRAY['staff_name','start_date','end_date','staff_id']::TEXT[],
   '/provider/staff/{{staff_id}}/days-off', 'Sent to owners/managers when an employee requests time off.'),
  ('staff_time_off_approved', 'Time off approved',
   'Your time off {{start_date}} – {{end_date}} was approved.',
   ARRAY['push']::TEXT[], ARRAY['start_date','end_date']::TEXT[],
   '/provider/staff/schedule', 'Sent to the requester when time off is approved.'),
  ('staff_time_off_denied', 'Time off denied',
   'Your time off request {{start_date}} – {{end_date}} was denied.',
   ARRAY['push']::TEXT[], ARRAY['start_date','end_date']::TEXT[],
   '/provider/staff/schedule', 'Sent to the requester when time off is denied.'),
  ('staff_tip_received', 'You received a tip',
   'A {{amount}} tip was added for {{customer_name}} ({{booking_date}}).',
   ARRAY['push']::TEXT[], ARRAY['amount','customer_name','booking_date','booking_id']::TEXT[],
   '/provider/my-earnings', 'Sent to the staff member when a tip is allocated to them.'),
  ('staff_pay_run_approved', 'Pay run approved',
   'Your pay for {{period_start}} – {{period_end}} ({{net_pay}}) has been approved.',
   ARRAY['push']::TEXT[], ARRAY['period_start','period_end','net_pay','pay_run_id']::TEXT[],
   '/provider/my-earnings', 'Sent to each staff member on a pay run when it is approved.'),
  ('staff_pay_run_paid', 'You have been paid',
   'Your pay for {{period_start}} – {{period_end}} ({{net_pay}}) was marked as paid{{reference_suffix}}.',
   ARRAY['push']::TEXT[], ARRAY['period_start','period_end','net_pay','reference_suffix','pay_run_id']::TEXT[],
   '/provider/my-earnings', 'Sent to each staff member on a pay run when it is marked paid.'),
  ('staff_over_cap_deactivated', 'Team members over your plan limit',
   '{{count}} team member(s) were deactivated because your plan allows {{limit}} active staff. Choose who stays before {{grace_until}}.',
   ARRAY['push','email']::TEXT[], ARRAY['count','limit','grace_until']::TEXT[],
   '/provider/staff', 'Sent to the business owner when a downgrade puts active staff over the plan cap.')
) AS v(key, title, body, channels, variables, url, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = v.key AND nt.tenant_id IS NULL
);
