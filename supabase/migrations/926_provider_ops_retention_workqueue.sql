-- Retention desk work queue: case signals, touches, booking sync trigger, quota metric

ALTER TABLE public.provider_ops_cases
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_qualifying_booking_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qualifying_booking_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS churn_reason TEXT
    CHECK (churn_reason IS NULL OR churn_reason IN ('cancelled_expired', 'dunning_exhausted', 'chargeback')),
  ADD COLUMN IF NOT EXISTS winback_step SMALLINT NOT NULL DEFAULT 0
    CHECK (winback_step >= 0 AND winback_step <= 2),
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.provider_ops_cases.next_follow_up_at IS 'Rep snooze; case re-enters working list when due.';
COMMENT ON COLUMN public.provider_ops_cases.last_qualifying_booking_at IS 'Latest booking in qualifying statuses for retention stage.';
COMMENT ON COLUMN public.provider_ops_cases.qualifying_booking_count IS 'Count of bookings in qualifying statuses (see retention-rules).';
COMMENT ON COLUMN public.provider_ops_cases.churn_reason IS 'Why subscription ops case was marked churned.';
COMMENT ON COLUMN public.provider_ops_cases.winback_step IS '0=new churn, 1=first touch, 2=parked after second touch.';
COMMENT ON COLUMN public.provider_ops_cases.returned_at IS 'When churned case was reopened; returned stage for 7 days.';

CREATE TABLE IF NOT EXISTS public.provider_ops_case_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES provider_ops_cases(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('call', 'whatsapp', 'email', 'note')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_ops_case_touches_case
  ON public.provider_ops_case_touches(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_ops_case_touches_provider
  ON public.provider_ops_case_touches(provider_id, created_at DESC);

ALTER TABLE public.provider_ops_case_touches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage provider_ops_case_touches"
  ON public.provider_ops_case_touches FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role::text IN (
      'superadmin','admin_operations','admin_support','admin_marketing',
      'admin_sales','admin_onboarding','admin_retention'
    )
  ));

-- Align provider_lead_tasks RLS with provider_ops_cases desk roles
DROP POLICY IF EXISTS "Admins can manage provider_lead_tasks" ON public.provider_lead_tasks;
CREATE POLICY "Admins can manage provider_lead_tasks"
  ON public.provider_lead_tasks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid()
    AND users.role::text IN (
      'superadmin','admin_operations','admin_support','admin_marketing',
      'admin_sales','admin_onboarding','admin_retention'
    )
  ));

CREATE INDEX IF NOT EXISTS idx_provider_lead_tasks_provider_open
  ON public.provider_lead_tasks(provider_id)
  WHERE completed_at IS NULL;

-- Expand quota metric enum (Postgres CHECK)
ALTER TABLE public.provider_ops_quotas
  DROP CONSTRAINT IF EXISTS provider_ops_quotas_metric_check;
ALTER TABLE public.provider_ops_quotas
  ADD CONSTRAINT provider_ops_quotas_metric_check CHECK (metric IN (
    'leads_contacted', 'leads_won', 'providers_activated', 'first_bookings',
    'at_risk_saves', 'providers_returned'
  ));

CREATE OR REPLACE FUNCTION public.is_qualifying_booking_status(st booking_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT st IN (
    'pending'::booking_status,
    'pending_payment'::booking_status,
    'confirmed'::booking_status,
    'in_progress'::booking_status,
    'completed'::booking_status,
    'waiting'::booking_status,
    'checked_in'::booking_status
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_provider_ops_case_booking_stats(p_provider_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first TIMESTAMPTZ;
  v_last TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_provider_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    MIN(b.created_at),
    MAX(b.created_at),
    COUNT(*)::INTEGER
  INTO v_first, v_last, v_count
  FROM bookings b
  WHERE b.provider_id = p_provider_id
    AND public.is_qualifying_booking_status(b.status);

  IF v_count IS NULL OR v_count = 0 THEN
    v_first := NULL;
    v_last := NULL;
    v_count := 0;
  END IF;

  UPDATE provider_ops_cases c
  SET
    first_booking_at = v_first,
    last_qualifying_booking_at = v_last,
    qualifying_booking_count = v_count,
    updated_at = NOW()
  WHERE c.provider_id = p_provider_id
    AND c.status IN ('open', 'activated');
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_bookings_sync_provider_ops_case_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_provider := OLD.provider_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.provider_id IS DISTINCT FROM NEW.provider_id THEN
      PERFORM public.sync_provider_ops_case_booking_stats(OLD.provider_id);
    END IF;
    v_provider := NEW.provider_id;
  ELSE
    v_provider := NEW.provider_id;
  END IF;

  PERFORM public.sync_provider_ops_case_booking_stats(v_provider);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bookings_sync_provider_ops_case_stats_ins ON public.bookings;
CREATE TRIGGER bookings_sync_provider_ops_case_stats_ins
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_bookings_sync_provider_ops_case_stats();

DROP TRIGGER IF EXISTS bookings_sync_provider_ops_case_stats_upd ON public.bookings;
CREATE TRIGGER bookings_sync_provider_ops_case_stats_upd
  AFTER UPDATE OF status, provider_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_bookings_sync_provider_ops_case_stats();

DROP TRIGGER IF EXISTS bookings_sync_provider_ops_case_stats_del ON public.bookings;
CREATE TRIGGER bookings_sync_provider_ops_case_stats_del
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_bookings_sync_provider_ops_case_stats();

-- Backfill from qualifying bookings
UPDATE provider_ops_cases c
SET
  first_booking_at = sub.first_at,
  last_qualifying_booking_at = sub.last_at,
  qualifying_booking_count = sub.cnt,
  updated_at = NOW()
FROM (
  SELECT
    b.provider_id,
    MIN(b.created_at) AS first_at,
    MAX(b.created_at) AS last_at,
    COUNT(*)::INTEGER AS cnt
  FROM bookings b
  WHERE public.is_qualifying_booking_status(b.status)
  GROUP BY b.provider_id
) sub
WHERE c.provider_id = sub.provider_id
  AND c.status IN ('open', 'activated');
