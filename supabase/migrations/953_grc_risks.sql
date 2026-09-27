-- GRC risk register, acceptances, exceptions

CREATE TABLE IF NOT EXISTS public.grc_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  likelihood INT NOT NULL DEFAULT 3 CHECK (likelihood BETWEEN 1 AND 5),
  impact INT NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  inherent_score INT GENERATED ALWAYS AS (likelihood * impact) STORED,
  status TEXT NOT NULL DEFAULT 'open',
  owner_user_id UUID REFERENCES public.users(id),
  above_appetite BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_risk_controls (
  risk_id UUID NOT NULL REFERENCES public.grc_risks(id) ON DELETE CASCADE,
  control_id TEXT NOT NULL REFERENCES public.grc_controls(id) ON DELETE CASCADE,
  PRIMARY KEY (risk_id, control_id)
);

CREATE TABLE IF NOT EXISTS public.grc_risk_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id UUID NOT NULL REFERENCES public.grc_risks(id) ON DELETE CASCADE,
  risk_manager_id UUID NOT NULL REFERENCES public.users(id),
  management_approver_id UUID NOT NULL REFERENCES public.users(id),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT grc_risk_acceptance_distinct CHECK (risk_manager_id <> management_approver_id)
);

CREATE TABLE IF NOT EXISTS public.grc_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  compensating_controls TEXT,
  review_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.grc_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_risk_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_risk_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_risks_select ON public.grc_risks FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.risks.view'));
CREATE POLICY grc_risks_write ON public.grc_risks FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.risks.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.risks.edit'));
CREATE POLICY grc_risk_controls_select ON public.grc_risk_controls FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.risks.view'));
CREATE POLICY grc_risk_accept_select ON public.grc_risk_acceptances FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.risks.view'));
CREATE POLICY grc_exceptions_select ON public.grc_exceptions FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.risks.view'));
