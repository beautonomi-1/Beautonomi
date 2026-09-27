-- GRC policy documents and versions

CREATE TABLE IF NOT EXISTS public.grc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'policy',
  status TEXT NOT NULL DEFAULT 'draft',
  owner_user_id UUID REFERENCES public.users(id),
  created_by UUID REFERENCES public.users(id),
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grc_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.grc_documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  body_markdown TEXT NOT NULL,
  author_user_id UUID NOT NULL REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.grc_document_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id UUID NOT NULL REFERENCES public.grc_document_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_version_id, user_id)
);

CREATE OR REPLACE FUNCTION public.grc_document_version_approve_sod()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.author_user_id THEN
    RAISE EXCEPTION 'document author cannot approve their own version';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_document_version_approve_sod_trg ON public.grc_document_versions;
CREATE TRIGGER grc_document_version_approve_sod_trg
  BEFORE INSERT OR UPDATE ON public.grc_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.grc_document_version_approve_sod();

ALTER TABLE public.grc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grc_document_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY grc_documents_select ON public.grc_documents FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.documents.view'));
CREATE POLICY grc_documents_write ON public.grc_documents FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.documents.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.documents.edit'));
CREATE POLICY grc_doc_versions_select ON public.grc_document_versions FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.documents.view'));
CREATE POLICY grc_doc_versions_write ON public.grc_document_versions FOR ALL TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.documents.edit'))
  WITH CHECK (public.grc_has_permission(auth.uid(), 'grc.documents.edit'));
CREATE POLICY grc_doc_ack_select ON public.grc_document_acknowledgements FOR SELECT TO authenticated
  USING (public.grc_has_permission(auth.uid(), 'grc.documents.view'));
