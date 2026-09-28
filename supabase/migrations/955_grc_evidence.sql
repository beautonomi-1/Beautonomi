-- GRC evidence locker (append-only rows) + storage bucket

CREATE TABLE IF NOT EXISTS public.grc_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id TEXT REFERENCES public.grc_controls(id),
  storage_path TEXT,
  content_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  source TEXT NOT NULL DEFAULT 'manual',
  submitted_by UUID REFERENCES public.users(id),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  supersedes_id UUID REFERENCES public.grc_evidence(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_evidence_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id TEXT NOT NULL REFERENCES public.grc_controls(id),
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  assignee_user_id UUID REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.grc_evidence_review_sod()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reviewed_by IS NOT NULL AND NEW.submitted_by IS NOT NULL AND NEW.reviewed_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'evidence submitter cannot review their own submission';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_evidence_review_sod_trg ON public.grc_evidence;
CREATE TRIGGER grc_evidence_review_sod_trg
  BEFORE INSERT OR UPDATE ON public.grc_evidence
  FOR EACH ROW EXECUTE FUNCTION public.grc_evidence_review_sod();

CREATE OR REPLACE FUNCTION public.grc_evidence_deny_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'grc_evidence is insert-only; supersede with a new row';
END;
$$;

DROP TRIGGER IF EXISTS grc_evidence_no_update ON public.grc_evidence;
CREATE TRIGGER grc_evidence_no_update
  BEFORE UPDATE OR DELETE ON public.grc_evidence
  FOR EACH ROW EXECUTE FUNCTION public.grc_evidence_deny_update();

ALTER TABLE public.grc_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_evidence_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_evidence_select ON public.grc_evidence FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.evidence.view'));
CREATE POLICY grc_evidence_insert ON public.grc_evidence FOR INSERT TO authenticated
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.evidence.submit'));
CREATE POLICY grc_evidence_requests_select ON public.grc_evidence_requests FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.evidence.view'));
CREATE POLICY grc_evidence_requests_write ON public.grc_evidence_requests FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.controls.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.controls.edit'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'grc-evidence') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'grc-evidence',
      'grc-evidence',
      false,
      52428800,
      ARRAY['application/json', 'application/pdf', 'image/png', 'image/jpeg', 'text/plain']
    );
  END IF;
END $$;

DROP POLICY IF EXISTS grc_evidence_bucket_insert ON storage.objects;
CREATE POLICY grc_evidence_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'grc-evidence'
    AND public.grc_has_permission(auth.uid(), 'grc.evidence.submit')
  );

DROP POLICY IF EXISTS grc_evidence_bucket_select ON storage.objects;
CREATE POLICY grc_evidence_bucket_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'grc-evidence'
    AND public.grc_has_permission(auth.uid(), 'grc.evidence.view')
  );

DROP POLICY IF EXISTS grc_evidence_bucket_service ON storage.objects;
CREATE POLICY grc_evidence_bucket_service ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'grc-evidence')
  WITH CHECK (bucket_id = 'grc-evidence');
