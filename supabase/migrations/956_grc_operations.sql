-- GRC operations: access reviews, findings, incidents, BC/DR, people

CREATE TABLE IF NOT EXISTS public.grc_access_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_access_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.grc_access_reviews(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES public.users(id),
  reviewer_user_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT,
  decided_at TIMESTAMPTZ,
  notes TEXT,
  CONSTRAINT grc_access_review_no_self_decide CHECK (subject_user_id <> reviewer_user_id)
);

CREATE TABLE IF NOT EXISTS public.grc_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT,
  due_at TIMESTAMPTZ,
  owner_user_id UUID REFERENCES public.users(id),
  closed_by UUID REFERENCES public.users(id),
  closed_at TIMESTAMPTZ,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  is_breach BOOLEAN NOT NULL DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  regulator_notified_at TIMESTAMPTZ,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_bcdr_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_type TEXT NOT NULL,
  conducted_at DATE NOT NULL,
  outcome TEXT NOT NULL,
  notes TEXT,
  owner_user_id UUID REFERENCES public.users(id)
);

CREATE TABLE IF NOT EXISTS public.grc_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  course_key TEXT NOT NULL,
  completed_at DATE NOT NULL,
  expires_at DATE
);

CREATE TABLE IF NOT EXISTS public.grc_personnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  event_type TEXT NOT NULL,
  event_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT
);

ALTER TABLE public.grc_access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_access_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_bcdr_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_personnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_access_reviews_select ON public.grc_access_reviews FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.access_reviews.view'));
CREATE POLICY grc_access_review_items_select ON public.grc_access_review_items FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.access_reviews.view'));
CREATE POLICY grc_findings_select ON public.grc_findings FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.findings.view'));
CREATE POLICY grc_findings_write ON public.grc_findings FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.findings.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.findings.edit'));
CREATE POLICY grc_incidents_select ON public.grc_incidents FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.incidents.view'));
CREATE POLICY grc_incidents_write ON public.grc_incidents FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.incidents.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.incidents.edit'));
CREATE POLICY grc_bcdr_select ON public.grc_bcdr_tests FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.incidents.view'));
CREATE POLICY grc_training_select ON public.grc_training_records FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audits.view'));
CREATE POLICY grc_personnel_select ON public.grc_personnel_events FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.audits.view'));
