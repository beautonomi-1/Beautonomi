-- GRC hub hardening + workflow RPCs (follows 949–958).
--
--  * Permission check requires an admin shell role and, for the caller's own session, an AAL2 (MFA) JWT,
--    so direct PostgREST access cannot bypass the API's forced-MFA gate.
--  * Superadmins without a GRC role can view and administer assignments/settings but never approve,
--    review, accept or attest (segregation of duties).
--  * Activity log: pgcrypto resolved via the extensions schema, hash covers actor + metadata,
--    created_at pinned to now(), writes via service role / SECURITY DEFINER only, chain verifier.
--  * Workflow state changes (approve, review, accept, close, decide, publish) only through RPCs that
--    enforce permission + SoD and write the activity log. Table policies block those states.
--  * No DELETE policies for authenticated on any GRC table: records are retired, not removed.
--
-- Idempotent: CREATE OR REPLACE, DROP POLICY IF EXISTS, ADD COLUMN IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══ 1. Settings ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.grc_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.grc_settings (key, value, description) VALUES
  ('risk_appetite_score', '12'::jsonb, 'Risks with a residual (or inherent) score at or above this value are above appetite and need dual acceptance.'),
  ('finding_sla_days', '{"critical":7,"high":30,"medium":90,"low":180,"info":365}'::jsonb, 'Default remediation due dates by finding severity.'),
  ('evidence_request_lead_days', '14'::jsonb, 'Days a control owner has to upload evidence after a request is raised.'),
  ('breach_notification_hours', '72'::jsonb, 'Regulator notification target for personal data breaches (GDPR Art. 33; POPIA s22 requires notification as soon as reasonably possible).'),
  ('dsar_response_days', '30'::jsonb, 'Target response time for data subject requests (POPIA s23 / GDPR Art. 12).')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.grc_setting_int(p_key TEXT, p_default INT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.grc_settings WHERE key = p_key), p_default);
$$;

-- ═══ 2. Permission core ══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.grc_has_permission(p_uid UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_uid IS NULL OR p_key IS NULL THEN
    RETURN false;
  END IF;

  -- A user's own session must be MFA-verified (AAL2). Service-role checks (auth.uid() NULL) skip this.
  IF p_uid = auth.uid() AND COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RETURN false;
  END IF;

  IF NOT public.grc_is_admin_user(p_uid) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.grc_role_assignments a
    JOIN public.grc_role_permissions p ON p.grc_role = a.grc_role
    WHERE a.user_id = p_uid
      AND a.is_active = true
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
      AND p.permission_key = p_key
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_uid AND u.role::text = 'superadmin') THEN
    RETURN p_key LIKE '%.view' OR p_key IN ('grc.assignments.manage', 'grc.settings.manage');
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.grc_has_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grc_has_permission(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grc_user_has_role(p_uid UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.grc_role_assignments a
    WHERE a.user_id = p_uid AND a.grc_role = p_role AND a.is_active = true
      AND (a.expires_at IS NULL OR a.expires_at > NOW())
  );
$$;

REVOKE ALL ON FUNCTION public.grc_user_has_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grc_user_has_role(UUID, TEXT) TO authenticated, service_role;

-- Internal: raise unless the caller holds p_key. Returns the caller id.
CREATE OR REPLACE FUNCTION public.grc_require(p_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'GRC_FORBIDDEN: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.grc_has_permission(v_uid, p_key) THEN
    RAISE EXCEPTION 'GRC_FORBIDDEN: %', p_key USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.grc_require(TEXT) FROM PUBLIC, anon, authenticated;

-- ═══ 3. Activity log: tamper-evident chain ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.grc_activity_row_hash(
  p_prev TEXT, p_actor UUID, p_label TEXT, p_action TEXT, p_etype TEXT, p_eid TEXT, p_meta JSONB, p_created TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(digest(concat_ws('|',
    COALESCE(p_prev, ''),
    COALESCE(p_actor::text, ''),
    COALESCE(p_label, ''),
    p_action,
    COALESCE(p_etype, ''),
    COALESCE(p_eid, ''),
    COALESCE(p_meta, '{}'::jsonb)::text,
    to_char(p_created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  ), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.grc_activity_log_chain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_prev TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('grc_activity_log_chain'));
  SELECT row_hash INTO v_prev FROM public.grc_activity_log ORDER BY id DESC LIMIT 1;
  NEW.created_at := NOW();
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.prev_hash := v_prev;
  NEW.row_hash := public.grc_activity_row_hash(
    NEW.prev_hash, NEW.actor_user_id, NEW.actor_label, NEW.action, NEW.entity_type, NEW.entity_id, NEW.metadata, NEW.created_at
  );
  RETURN NEW;
END;
$$;

-- Re-hash any rows written under the 950 algorithm so the chain verifies end to end.
DO $$
DECLARE
  r RECORD;
  v_prev TEXT := NULL;
  v_hash TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.grc_activity_log) THEN
    ALTER TABLE public.grc_activity_log DISABLE TRIGGER grc_activity_log_no_update;
    FOR r IN SELECT * FROM public.grc_activity_log ORDER BY id LOOP
      v_hash := public.grc_activity_row_hash(v_prev, r.actor_user_id, r.actor_label, r.action, r.entity_type, r.entity_id, r.metadata, r.created_at);
      UPDATE public.grc_activity_log SET prev_hash = v_prev, row_hash = v_hash WHERE id = r.id;
      v_prev := v_hash;
    END LOOP;
    ALTER TABLE public.grc_activity_log ENABLE TRIGGER grc_activity_log_no_update;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.grc_verify_activity_chain()
RETURNS TABLE (rows_checked BIGINT, first_broken_id BIGINT, last_hash TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  r RECORD;
  v_prev TEXT := NULL;
  v_n BIGINT := 0;
BEGIN
  FOR r IN SELECT * FROM public.grc_activity_log ORDER BY id LOOP
    v_n := v_n + 1;
    IF r.prev_hash IS DISTINCT FROM v_prev
       OR r.row_hash <> public.grc_activity_row_hash(r.prev_hash, r.actor_user_id, r.actor_label, r.action, r.entity_type, r.entity_id, r.metadata, r.created_at)
    THEN
      rows_checked := v_n; first_broken_id := r.id; last_hash := v_prev;
      RETURN NEXT;
      RETURN;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
  rows_checked := v_n; first_broken_id := NULL; last_hash := v_prev;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.grc_verify_activity_chain() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grc_verify_activity_chain() TO service_role;

DROP POLICY IF EXISTS grc_activity_log_insert ON public.grc_activity_log;
CREATE INDEX IF NOT EXISTS grc_activity_log_entity_idx ON public.grc_activity_log (entity_type, entity_id);

-- Internal: append an activity row as the calling user.
CREATE OR REPLACE FUNCTION public.grc_log(p_action TEXT, p_entity_type TEXT, p_entity_id TEXT, p_metadata JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.grc_activity_log (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.grc_log(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ═══ 4. Role assignments ═════════════════════════════════════════════════════
ALTER TABLE public.grc_role_assignments ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES public.users(id);
ALTER TABLE public.grc_role_assignments ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.grc_role_assignments ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

CREATE OR REPLACE FUNCTION public.grc_role_assignments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.assigned_by := auth.uid();
    END IF;
    IF NEW.assigned_by IS NOT NULL AND NOT public.grc_is_admin_user(NEW.assigned_by) THEN
      RAISE EXCEPTION 'GRC_FORBIDDEN: assignments must be granted by an admin user';
    END IF;
    IF NEW.assigned_by IS NOT NULL AND NEW.assigned_by = NEW.user_id THEN
      RAISE EXCEPTION 'GRC_SOD: you cannot grant a GRC role to yourself';
    END IF;
    IF NOT public.grc_is_admin_user(NEW.user_id) THEN
      RAISE EXCEPTION 'GRC_INVALID: GRC roles can only be granted to users with an admin portal role';
    END IF;
    IF length(trim(COALESCE(NEW.reason, ''))) < 5 THEN
      RAISE EXCEPTION 'GRC_INVALID: a reason is required';
    END IF;
    NEW.is_active := true;
    NEW.revoked_by := NULL;
    NEW.revoked_at := NULL;
  ELSE
    IF NEW.user_id <> OLD.user_id OR NEW.grc_role <> OLD.grc_role OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'GRC_INVALID: assignments are immutable; revoke and grant a new one';
    END IF;
    IF OLD.is_active = false AND NEW.is_active = true THEN
      RAISE EXCEPTION 'GRC_INVALID: revoked assignments cannot be reactivated; grant a new one';
    END IF;
    IF OLD.is_active = true AND NEW.is_active = false THEN
      NEW.revoked_at := NOW();
      NEW.revoked_by := COALESCE(auth.uid(), NEW.revoked_by);
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_role_assignments_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.grc_activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), NEW.assigned_by), 'grc.assignment.granted', 'grc_role_assignment', NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'grc_role', NEW.grc_role, 'reason', NEW.reason, 'expires_at', NEW.expires_at));
  ELSIF OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO public.grc_activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (COALESCE(auth.uid(), NEW.revoked_by), 'grc.assignment.revoked', 'grc_role_assignment', NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'grc_role', NEW.grc_role, 'reason', NEW.revoke_reason));
  ELSIF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    INSERT INTO public.grc_activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'grc.assignment.expiry_changed', 'grc_role_assignment', NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'grc_role', NEW.grc_role, 'from', OLD.expires_at, 'to', NEW.expires_at));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_role_assignments_audit_trg ON public.grc_role_assignments;
CREATE TRIGGER grc_role_assignments_audit_trg
  AFTER INSERT OR UPDATE ON public.grc_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.grc_role_assignments_audit();

CREATE OR REPLACE FUNCTION public.grc_deny_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'GRC_INVALID: % rows cannot be deleted; retire or revoke them instead', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS grc_role_assignments_no_delete ON public.grc_role_assignments;
CREATE TRIGGER grc_role_assignments_no_delete
  BEFORE DELETE ON public.grc_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.grc_deny_delete();

DROP POLICY IF EXISTS grc_role_assignments_select ON public.grc_role_assignments;
CREATE POLICY grc_role_assignments_select ON public.grc_role_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT public.grc_has_permission(auth.uid(), 'grc.overview.view'))
  );

DROP POLICY IF EXISTS grc_role_assignments_write ON public.grc_role_assignments;
DROP POLICY IF EXISTS grc_role_assignments_insert ON public.grc_role_assignments;
CREATE POLICY grc_role_assignments_insert ON public.grc_role_assignments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.assignments.manage')));
DROP POLICY IF EXISTS grc_role_assignments_update ON public.grc_role_assignments;
CREATE POLICY grc_role_assignments_update ON public.grc_role_assignments
  FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.assignments.manage')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.assignments.manage')));

DROP POLICY IF EXISTS grc_role_permissions_read ON public.grc_role_permissions;
CREATE POLICY grc_role_permissions_read ON public.grc_role_permissions
  FOR SELECT TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.overview.view')));

ALTER TABLE public.grc_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grc_settings_select ON public.grc_settings;
CREATE POLICY grc_settings_select ON public.grc_settings FOR SELECT TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.overview.view')));
DROP POLICY IF EXISTS grc_settings_update ON public.grc_settings;
CREATE POLICY grc_settings_update ON public.grc_settings FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.settings.manage')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.settings.manage')));

CREATE OR REPLACE FUNCTION public.grc_settings_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  IF TG_OP = 'UPDATE' AND NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO public.grc_activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'grc.setting.changed', 'grc_setting', NEW.key, jsonb_build_object('from', OLD.value, 'to', NEW.value));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_settings_audit_trg ON public.grc_settings;
CREATE TRIGGER grc_settings_audit_trg
  BEFORE INSERT OR UPDATE ON public.grc_settings
  FOR EACH ROW EXECUTE FUNCTION public.grc_settings_audit();

-- ═══ 5. Frameworks, controls, SoA ════════════════════════════════════════════
ALTER TABLE public.grc_requirements ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.grc_controls ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'quarterly';
ALTER TABLE public.grc_controls ADD COLUMN IF NOT EXISTS implementation_notes TEXT;
ALTER TABLE public.grc_controls ADD COLUMN IF NOT EXISTS last_evidence_at TIMESTAMPTZ;
ALTER TABLE public.grc_controls ADD COLUMN IF NOT EXISTS next_review_at DATE;

UPDATE public.grc_controls SET status = 'not_started'
WHERE status NOT IN ('not_started', 'in_progress', 'implemented', 'operating', 'not_applicable');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_controls_status_check') THEN
    ALTER TABLE public.grc_controls ADD CONSTRAINT grc_controls_status_check
      CHECK (status IN ('not_started', 'in_progress', 'implemented', 'operating', 'not_applicable'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_controls_frequency_check') THEN
    ALTER TABLE public.grc_controls ADD CONSTRAINT grc_controls_frequency_check
      CHECK (frequency IN ('continuous', 'monthly', 'quarterly', 'semiannual', 'annual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS grc_controls_collector_idx ON public.grc_controls (collector_key) WHERE collector_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.grc_controls_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
    IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.grc_activity_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'grc.control.status_changed', 'grc_control', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_controls_touch_trg ON public.grc_controls;
CREATE TRIGGER grc_controls_touch_trg
  BEFORE INSERT OR UPDATE ON public.grc_controls
  FOR EACH ROW EXECUTE FUNCTION public.grc_controls_touch();

DROP POLICY IF EXISTS grc_controls_write ON public.grc_controls;
DROP POLICY IF EXISTS grc_controls_insert ON public.grc_controls;
CREATE POLICY grc_controls_insert ON public.grc_controls FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.controls.edit')));
DROP POLICY IF EXISTS grc_controls_update ON public.grc_controls;
CREATE POLICY grc_controls_update ON public.grc_controls FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.controls.edit')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.controls.edit')));

DROP POLICY IF EXISTS grc_control_req_insert ON public.grc_control_requirements;
CREATE POLICY grc_control_req_insert ON public.grc_control_requirements FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.controls.edit')));

ALTER TABLE public.grc_soa_versions ADD COLUMN IF NOT EXISTS notes TEXT;

DROP POLICY IF EXISTS grc_soa_write ON public.grc_soa_versions;
DROP POLICY IF EXISTS grc_soa_entries_write ON public.grc_soa_entries;
DROP POLICY IF EXISTS grc_soa_entries_update ON public.grc_soa_entries;
CREATE POLICY grc_soa_entries_update ON public.grc_soa_entries FOR UPDATE TO authenticated
  USING (
    (SELECT public.grc_has_permission(auth.uid(), 'grc.controls.edit'))
    AND EXISTS (SELECT 1 FROM public.grc_soa_versions v WHERE v.id = soa_version_id AND v.status = 'draft')
  )
  WITH CHECK (
    (SELECT public.grc_has_permission(auth.uid(), 'grc.controls.edit'))
    AND EXISTS (SELECT 1 FROM public.grc_soa_versions v WHERE v.id = soa_version_id AND v.status = 'draft')
  );

CREATE OR REPLACE FUNCTION public.grc_create_soa_draft(p_label TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.controls.edit');
  v_id UUID;
  v_prev UUID;
BEGIN
  IF length(trim(COALESCE(p_label, ''))) = 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: a version label is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.grc_soa_versions WHERE status = 'draft') THEN
    RAISE EXCEPTION 'GRC_INVALID: a draft Statement of Applicability already exists; publish or edit it first';
  END IF;

  INSERT INTO public.grc_soa_versions (version_label, status, created_by)
  VALUES (trim(p_label), 'draft', v_uid)
  RETURNING id INTO v_id;

  SELECT id INTO v_prev FROM public.grc_soa_versions
  WHERE status = 'published' ORDER BY approved_at DESC NULLS LAST LIMIT 1;

  INSERT INTO public.grc_soa_entries (soa_version_id, requirement_id, applicable, justification, control_id)
  SELECT v_id, r.id,
         COALESCE(prev.applicable, true),
         prev.justification,
         COALESCE(prev.control_id, (SELECT min(cr.control_id) FROM public.grc_control_requirements cr WHERE cr.requirement_id = r.id))
  FROM public.grc_requirements r
  LEFT JOIN public.grc_soa_entries prev ON prev.soa_version_id = v_prev AND prev.requirement_id = r.id
  WHERE r.framework_id = 'iso27001' AND r.category = 'annex_a';

  PERFORM public.grc_log('grc.soa.draft_created', 'grc_soa_version', v_id::text, jsonb_build_object('label', p_label, 'based_on', v_prev));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_publish_soa(p_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.documents.approve');
  v RECORD;
  v_missing INT;
BEGIN
  SELECT * INTO v FROM public.grc_soa_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: Statement of Applicability version'; END IF;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'GRC_INVALID: only a draft can be published'; END IF;
  IF v.created_by = v_uid THEN RAISE EXCEPTION 'GRC_SOD: the person who prepared the SoA cannot publish it'; END IF;

  SELECT count(*) INTO v_missing FROM public.grc_soa_entries e
  WHERE e.soa_version_id = p_version_id
    AND ((e.applicable AND e.control_id IS NULL) OR (NOT e.applicable AND length(trim(COALESCE(e.justification, ''))) = 0));
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: % entries need a control (if applicable) or a justification (if excluded)', v_missing;
  END IF;

  UPDATE public.grc_soa_versions SET status = 'superseded' WHERE status = 'published';
  UPDATE public.grc_soa_versions SET status = 'published', approved_by = v_uid, approved_at = NOW() WHERE id = p_version_id;
  PERFORM public.grc_log('grc.soa.published', 'grc_soa_version', p_version_id::text, jsonb_build_object('label', v.version_label));
END;
$$;

-- ═══ 6. Documents ════════════════════════════════════════════════════════════
ALTER TABLE public.grc_documents ADD COLUMN IF NOT EXISTS current_version_id UUID REFERENCES public.grc_document_versions(id);
ALTER TABLE public.grc_documents ADD COLUMN IF NOT EXISTS next_review_at DATE;
ALTER TABLE public.grc_documents ADD COLUMN IF NOT EXISTS requires_acknowledgement BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.grc_document_versions ADD COLUMN IF NOT EXISTS change_summary TEXT;

CREATE OR REPLACE FUNCTION public.grc_document_version_approve_sod()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.author_user_id <> OLD.author_user_id THEN
    RAISE EXCEPTION 'GRC_INVALID: the author of a version cannot be changed';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'superseded') AND NEW.body_markdown <> OLD.body_markdown THEN
    RAISE EXCEPTION 'GRC_INVALID: approved versions are immutable; create a new version';
  END IF;
  IF NEW.status = 'approved' AND NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.author_user_id THEN
    RAISE EXCEPTION 'GRC_SOD: the author of a document version cannot approve it';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS grc_documents_write ON public.grc_documents;
DROP POLICY IF EXISTS grc_documents_update ON public.grc_documents;
CREATE POLICY grc_documents_update ON public.grc_documents FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.documents.edit')))
  WITH CHECK (
    (SELECT public.grc_has_permission(auth.uid(), 'grc.documents.edit'))
    AND status IN ('draft', 'approved', 'retired')
  );

CREATE OR REPLACE FUNCTION public.grc_documents_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  IF auth.uid() IS NOT NULL THEN NEW.updated_by := auth.uid(); END IF;
  -- Only the approval RPC (which sets the grc.approving flag) may move a document to approved or change its current version.
  IF COALESCE(current_setting('grc.approving', true), '') <> 'on' AND auth.uid() IS NOT NULL THEN
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
      RAISE EXCEPTION 'GRC_INVALID: the current version changes only through approval';
    END IF;
    IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'GRC_INVALID: documents are approved through the approval workflow';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_documents_guard_trg ON public.grc_documents;
CREATE TRIGGER grc_documents_guard_trg
  BEFORE UPDATE ON public.grc_documents
  FOR EACH ROW EXECUTE FUNCTION public.grc_documents_guard();

DROP TRIGGER IF EXISTS grc_documents_no_delete ON public.grc_documents;
CREATE TRIGGER grc_documents_no_delete BEFORE DELETE ON public.grc_documents
  FOR EACH ROW EXECUTE FUNCTION public.grc_deny_delete();

DROP POLICY IF EXISTS grc_doc_versions_write ON public.grc_document_versions;
DROP POLICY IF EXISTS grc_doc_versions_update ON public.grc_document_versions;
CREATE POLICY grc_doc_versions_update ON public.grc_document_versions FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.documents.edit')) AND status = 'draft')
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.documents.edit')) AND status = 'draft');

DROP TRIGGER IF EXISTS grc_doc_versions_no_delete ON public.grc_document_versions;
CREATE TRIGGER grc_doc_versions_no_delete BEFORE DELETE ON public.grc_document_versions
  FOR EACH ROW EXECUTE FUNCTION public.grc_deny_delete();

CREATE OR REPLACE FUNCTION public.grc_create_document(
  p_slug TEXT, p_title TEXT, p_doc_type TEXT, p_body TEXT, p_owner_user_id UUID DEFAULT NULL, p_requires_ack BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.documents.edit');
  v_doc UUID;
BEGIN
  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,80}$' THEN
    RAISE EXCEPTION 'GRC_INVALID: slug must be lowercase letters, digits and hyphens';
  END IF;
  IF length(trim(COALESCE(p_title, ''))) = 0 OR length(trim(COALESCE(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: title and body are required';
  END IF;
  INSERT INTO public.grc_documents (slug, title, doc_type, status, owner_user_id, created_by, updated_by, requires_acknowledgement)
  VALUES (p_slug, trim(p_title), COALESCE(NULLIF(p_doc_type, ''), 'policy'), 'draft', COALESCE(p_owner_user_id, v_uid), v_uid, v_uid, COALESCE(p_requires_ack, false))
  RETURNING id INTO v_doc;
  INSERT INTO public.grc_document_versions (document_id, version_number, body_markdown, author_user_id, status, change_summary)
  VALUES (v_doc, 1, p_body, v_uid, 'draft', 'Initial version');
  PERFORM public.grc_log('grc.document.created', 'grc_document', v_doc::text, jsonb_build_object('slug', p_slug));
  RETURN v_doc;
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_create_document_version(p_document_id UUID, p_body TEXT, p_change_summary TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.documents.edit');
  v_next INT;
  v_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.grc_documents WHERE id = p_document_id) THEN
    RAISE EXCEPTION 'GRC_NOT_FOUND: document';
  END IF;
  IF EXISTS (SELECT 1 FROM public.grc_document_versions WHERE document_id = p_document_id AND status IN ('draft', 'in_review')) THEN
    RAISE EXCEPTION 'GRC_INVALID: this document already has an open draft; edit or approve it first';
  END IF;
  IF length(trim(COALESCE(p_body, ''))) = 0 OR length(trim(COALESCE(p_change_summary, ''))) = 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: body and change summary are required';
  END IF;
  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next FROM public.grc_document_versions WHERE document_id = p_document_id;
  INSERT INTO public.grc_document_versions (document_id, version_number, body_markdown, author_user_id, status, change_summary)
  VALUES (p_document_id, v_next, p_body, v_uid, 'draft', trim(p_change_summary))
  RETURNING id INTO v_id;
  PERFORM public.grc_log('grc.document.version_created', 'grc_document', p_document_id::text, jsonb_build_object('version', v_next));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_submit_document_version(p_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.documents.edit');
  v RECORD;
BEGIN
  SELECT * INTO v FROM public.grc_document_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: document version'; END IF;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'GRC_INVALID: only drafts can be submitted for approval'; END IF;
  UPDATE public.grc_document_versions SET status = 'in_review' WHERE id = p_version_id;
  PERFORM public.grc_log('grc.document.submitted', 'grc_document', v.document_id::text, jsonb_build_object('version', v.version_number));
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_approve_document_version(p_version_id UUID, p_next_review_at DATE DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.documents.approve');
  v RECORD;
BEGIN
  SELECT * INTO v FROM public.grc_document_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: document version'; END IF;
  IF v.status NOT IN ('draft', 'in_review') THEN RAISE EXCEPTION 'GRC_INVALID: this version is already %', v.status; END IF;
  IF v.author_user_id = v_uid THEN RAISE EXCEPTION 'GRC_SOD: the author of a document version cannot approve it'; END IF;

  PERFORM set_config('grc.approving', 'on', true);
  UPDATE public.grc_document_versions SET status = 'superseded'
  WHERE document_id = v.document_id AND status = 'approved';
  UPDATE public.grc_document_versions SET status = 'approved', approved_by = v_uid, approved_at = NOW() WHERE id = p_version_id;
  UPDATE public.grc_documents
  SET status = 'approved', current_version_id = p_version_id,
      next_review_at = COALESCE(p_next_review_at, (CURRENT_DATE + INTERVAL '12 months')::date)
  WHERE id = v.document_id;
  PERFORM set_config('grc.approving', 'off', true);

  PERFORM public.grc_log('grc.document.approved', 'grc_document', v.document_id::text,
    jsonb_build_object('version', v.version_number, 'author', v.author_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_acknowledge_document(p_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.documents.view');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.grc_document_versions WHERE id = p_version_id AND status = 'approved') THEN
    RAISE EXCEPTION 'GRC_INVALID: only the approved version can be acknowledged';
  END IF;
  INSERT INTO public.grc_document_acknowledgements (document_version_id, user_id)
  VALUES (p_version_id, v_uid)
  ON CONFLICT (document_version_id, user_id) DO NOTHING;
END;
$$;

-- ═══ 7. Risks ════════════════════════════════════════════════════════════════
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS treatment TEXT;
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS treatment_plan TEXT;
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS residual_likelihood INT;
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS residual_impact INT;
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS review_due_at DATE;
ALTER TABLE public.grc_risks ADD COLUMN IF NOT EXISTS owner_team TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'grc_risks' AND column_name = 'residual_score') THEN
    ALTER TABLE public.grc_risks ADD COLUMN residual_score INT GENERATED ALWAYS AS (residual_likelihood * residual_impact) STORED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_risks_residual_range') THEN
    ALTER TABLE public.grc_risks ADD CONSTRAINT grc_risks_residual_range CHECK (
      (residual_likelihood IS NULL OR residual_likelihood BETWEEN 1 AND 5)
      AND (residual_impact IS NULL OR residual_impact BETWEEN 1 AND 5)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_risks_treatment_check') THEN
    ALTER TABLE public.grc_risks ADD CONSTRAINT grc_risks_treatment_check
      CHECK (treatment IS NULL OR treatment IN ('mitigate', 'accept', 'transfer', 'avoid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_risks_status_check') THEN
    UPDATE public.grc_risks SET status = 'open' WHERE status NOT IN ('open', 'treating', 'accepted', 'closed');
    ALTER TABLE public.grc_risks ADD CONSTRAINT grc_risks_status_check
      CHECK (status IN ('open', 'treating', 'accepted', 'closed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.grc_risks_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.above_appetite := COALESCE(NEW.residual_likelihood * NEW.residual_impact, NEW.likelihood * NEW.impact)
                        >= public.grc_setting_int('risk_appetite_score', 12);
  NEW.updated_at := NOW();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
    IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); END IF;
  END IF;
  IF COALESCE(current_setting('grc.accepting', true), '') <> 'on' AND auth.uid() IS NOT NULL
     AND NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status <> 'accepted') THEN
    RAISE EXCEPTION 'GRC_INVALID: risks are accepted through the acceptance workflow';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    UPDATE public.grc_risk_acceptances SET status = 'lapsed' WHERE risk_id = NEW.id AND status = 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_risks_guard_trg ON public.grc_risks;
CREATE TRIGGER grc_risks_guard_trg
  BEFORE INSERT OR UPDATE ON public.grc_risks
  FOR EACH ROW EXECUTE FUNCTION public.grc_risks_guard();

DROP TRIGGER IF EXISTS grc_risks_no_delete ON public.grc_risks;
CREATE TRIGGER grc_risks_no_delete BEFORE DELETE ON public.grc_risks
  FOR EACH ROW EXECUTE FUNCTION public.grc_deny_delete();

UPDATE public.grc_risks SET updated_at = NOW();

DROP POLICY IF EXISTS grc_risks_write ON public.grc_risks;
DROP POLICY IF EXISTS grc_risks_insert ON public.grc_risks;
CREATE POLICY grc_risks_insert ON public.grc_risks FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')));
DROP POLICY IF EXISTS grc_risks_update ON public.grc_risks;
CREATE POLICY grc_risks_update ON public.grc_risks FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')));

DROP POLICY IF EXISTS grc_risk_controls_insert ON public.grc_risk_controls;
CREATE POLICY grc_risk_controls_insert ON public.grc_risk_controls FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')));
DROP POLICY IF EXISTS grc_risk_controls_delete ON public.grc_risk_controls;
CREATE POLICY grc_risk_controls_delete ON public.grc_risk_controls FOR DELETE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')));

ALTER TABLE public.grc_risk_acceptances ALTER COLUMN management_approver_id DROP NOT NULL;
ALTER TABLE public.grc_risk_acceptances ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.grc_risk_acceptances ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.grc_risk_acceptances ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE public.grc_risk_acceptances ADD COLUMN IF NOT EXISTS decision_notes TEXT;
ALTER TABLE public.grc_risk_acceptances ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE public.grc_risk_acceptances ADD COLUMN IF NOT EXISTS above_appetite BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.grc_risk_acceptances ALTER COLUMN accepted_at DROP NOT NULL;
ALTER TABLE public.grc_risk_acceptances ALTER COLUMN accepted_at DROP DEFAULT;
ALTER TABLE public.grc_risk_acceptances ALTER COLUMN status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_risk_acceptances_status_check') THEN
    ALTER TABLE public.grc_risk_acceptances ADD CONSTRAINT grc_risk_acceptances_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'lapsed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS grc_risk_acceptances_one_pending
  ON public.grc_risk_acceptances (risk_id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.grc_propose_risk_acceptance(p_risk_id UUID, p_rationale TEXT, p_expires_at DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.risks.accept');
  r RECORD;
  v_id UUID;
BEGIN
  IF NOT public.grc_user_has_role(v_uid, 'risk_manager') THEN
    RAISE EXCEPTION 'GRC_FORBIDDEN: only a risk manager can propose a risk acceptance';
  END IF;
  SELECT * INTO r FROM public.grc_risks WHERE id = p_risk_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: risk'; END IF;
  IF r.status IN ('accepted', 'closed') THEN RAISE EXCEPTION 'GRC_INVALID: risk is already %', r.status; END IF;
  IF length(trim(COALESCE(p_rationale, ''))) < 20 THEN
    RAISE EXCEPTION 'GRC_INVALID: explain why the risk is being accepted (at least 20 characters)';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= CURRENT_DATE OR p_expires_at > CURRENT_DATE + INTERVAL '12 months' THEN
    RAISE EXCEPTION 'GRC_INVALID: acceptance must expire within the next 12 months';
  END IF;

  INSERT INTO public.grc_risk_acceptances (risk_id, risk_manager_id, notes, expires_at, status, above_appetite)
  VALUES (p_risk_id, v_uid, trim(p_rationale), p_expires_at, 'pending', r.above_appetite)
  RETURNING id INTO v_id;

  IF NOT r.above_appetite THEN
    UPDATE public.grc_risk_acceptances SET status = 'approved', accepted_at = NOW(), decided_at = NOW() WHERE id = v_id;
    PERFORM set_config('grc.accepting', 'on', true);
    UPDATE public.grc_risks SET status = 'accepted', treatment = 'accept', review_due_at = p_expires_at WHERE id = p_risk_id;
    PERFORM set_config('grc.accepting', 'off', true);
    PERFORM public.grc_log('grc.risk.accepted', 'grc_risk', p_risk_id::text, jsonb_build_object('acceptance_id', v_id, 'dual_approval', false));
  ELSE
    PERFORM public.grc_log('grc.risk.acceptance_proposed', 'grc_risk', p_risk_id::text, jsonb_build_object('acceptance_id', v_id));
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_decide_risk_acceptance(p_acceptance_id UUID, p_approve BOOLEAN, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.risks.accept');
  a RECORD;
BEGIN
  IF NOT public.grc_user_has_role(v_uid, 'management_approver') THEN
    RAISE EXCEPTION 'GRC_FORBIDDEN: only a management approver can decide an above-appetite acceptance';
  END IF;
  SELECT * INTO a FROM public.grc_risk_acceptances WHERE id = p_acceptance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: risk acceptance'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'GRC_INVALID: acceptance is already %', a.status; END IF;
  IF a.risk_manager_id = v_uid THEN RAISE EXCEPTION 'GRC_SOD: the proposer cannot also approve the acceptance'; END IF;
  IF NOT p_approve AND length(trim(COALESCE(p_notes, ''))) = 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: give a reason for rejecting';
  END IF;

  UPDATE public.grc_risk_acceptances
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      management_approver_id = v_uid,
      decided_at = NOW(),
      accepted_at = CASE WHEN p_approve THEN NOW() ELSE NULL END,
      decision_notes = NULLIF(trim(COALESCE(p_notes, '')), '')
  WHERE id = p_acceptance_id;

  IF p_approve THEN
    PERFORM set_config('grc.accepting', 'on', true);
    UPDATE public.grc_risks SET status = 'accepted', treatment = 'accept', review_due_at = a.expires_at WHERE id = a.risk_id;
    PERFORM set_config('grc.accepting', 'off', true);
  END IF;
  PERFORM public.grc_log(CASE WHEN p_approve THEN 'grc.risk.accepted' ELSE 'grc.risk.acceptance_rejected' END,
    'grc_risk', a.risk_id::text, jsonb_build_object('acceptance_id', p_acceptance_id, 'dual_approval', true, 'proposer', a.risk_manager_id));
END;
$$;

ALTER TABLE public.grc_exceptions ADD COLUMN IF NOT EXISTS risk_id UUID REFERENCES public.grc_risks(id);
ALTER TABLE public.grc_exceptions ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);

DROP POLICY IF EXISTS grc_exceptions_insert ON public.grc_exceptions;
CREATE POLICY grc_exceptions_insert ON public.grc_exceptions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')));
DROP POLICY IF EXISTS grc_exceptions_update ON public.grc_exceptions;
CREATE POLICY grc_exceptions_update ON public.grc_exceptions FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.risks.edit')));

UPDATE public.grc_exceptions
SET title = 'Web app CSP allows unsafe-inline and unsafe-eval scripts',
    description = 'The enforced Content-Security-Policy for apps/web (next.config.mjs) allows ''unsafe-inline'' and ''unsafe-eval'' in script-src because Next.js inline runtime scripts, Mapbox GL JS and some analytics SDKs need them. A nonce + strict-dynamic policy (src/lib/security/csp-nonce.ts, set in proxy.ts) runs in Report-Only mode to validate the migration.',
    compensating_controls = 'React output escaping by default; no dangerouslySetInnerHTML with user input; strict host allow-list for script-src; object-src none; base-uri and form-action self; frame-ancestors restricted; HSTS preload; dependency scanning in CI; admin MFA.'
WHERE title = 'Admin SPA CSP unsafe-inline / unsafe-eval';

-- ═══ 8. Assets, vendors, privacy ═════════════════════════════════════════════
ALTER TABLE public.grc_assets ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.grc_assets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.grc_assets ADD COLUMN IF NOT EXISTS data_classification TEXT;
ALTER TABLE public.grc_assets ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.grc_assets ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.grc_vendors ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS criticality TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS data_location TEXT;
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS certifications TEXT;
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS certification_expires_at DATE;
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS next_review_at DATE;
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.grc_vendors ADD COLUMN IF NOT EXISTS website TEXT;

ALTER TABLE public.grc_processing_activities ADD COLUMN IF NOT EXISTS data_categories TEXT;
ALTER TABLE public.grc_processing_activities ADD COLUMN IF NOT EXISTS recipients TEXT;
ALTER TABLE public.grc_processing_activities ADD COLUMN IF NOT EXISTS cross_border_transfers TEXT;
ALTER TABLE public.grc_processing_activities ADD COLUMN IF NOT EXISTS security_measures TEXT;
ALTER TABLE public.grc_processing_activities ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.grc_processing_activities ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.grc_data_subject_requests ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.grc_data_subject_requests ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE public.grc_data_subject_requests ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.grc_data_subject_requests ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);

CREATE OR REPLACE FUNCTION public.grc_dsr_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.due_at IS NULL THEN
    NEW.due_at := NEW.received_at + make_interval(days => public.grc_setting_int('dsar_response_days', 30));
  END IF;
  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_dsr_defaults_trg ON public.grc_data_subject_requests;
CREATE TRIGGER grc_dsr_defaults_trg
  BEFORE INSERT OR UPDATE ON public.grc_data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION public.grc_dsr_defaults();

DO $$
DECLARE
  t TEXT;
  perm TEXT;
  pairs TEXT[][] := ARRAY[
    ARRAY['grc_assets', 'grc.assets.edit'],
    ARRAY['grc_data_flows', 'grc.assets.edit'],
    ARRAY['grc_vendors', 'grc.vendors.edit'],
    ARRAY['grc_vendor_assessments', 'grc.vendors.edit'],
    ARRAY['grc_processing_activities', 'grc.privacy.edit'],
    ARRAY['grc_dpias', 'grc.privacy.edit'],
    ARRAY['grc_data_subject_requests', 'grc.privacy.edit'],
    ARRAY['grc_incidents', 'grc.incidents.edit'],
    ARRAY['grc_bcdr_tests', 'grc.incidents.edit'],
    ARRAY['grc_training_records', 'grc.people.edit'],
    ARRAY['grc_personnel_events', 'grc.people.edit'],
    ARRAY['grc_internal_audits', 'grc.audits.edit'],
    ARRAY['grc_objectives', 'grc.audits.edit'],
    ARRAY['grc_corrective_actions', 'grc.findings.edit'],
    ARRAY['grc_evidence_requests', 'grc.controls.edit']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    t := pairs[i][1];
    perm := pairs[i][2];
    -- Remove legacy FOR ALL policies (they allowed DELETE).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), %L)))',
      t || '_insert', t, perm);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.grc_has_permission(auth.uid(), %L))) WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), %L)))',
      t || '_update', t, perm, perm);
  END LOOP;
END $$;

DROP POLICY IF EXISTS grc_assets_write ON public.grc_assets;
DROP POLICY IF EXISTS grc_vendors_write ON public.grc_vendors;
DROP POLICY IF EXISTS grc_privacy_write ON public.grc_processing_activities;
DROP POLICY IF EXISTS grc_incidents_write ON public.grc_incidents;
DROP POLICY IF EXISTS grc_audits_write ON public.grc_internal_audits;

DROP POLICY IF EXISTS grc_training_select ON public.grc_training_records;
CREATE POLICY grc_training_select ON public.grc_training_records FOR SELECT TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.people.view')));
DROP POLICY IF EXISTS grc_personnel_select ON public.grc_personnel_events;
CREATE POLICY grc_personnel_select ON public.grc_personnel_events FOR SELECT TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.people.view')));

ALTER TABLE public.grc_personnel_events ADD COLUMN IF NOT EXISTS access_removed_at TIMESTAMPTZ;
ALTER TABLE public.grc_personnel_events ADD COLUMN IF NOT EXISTS checklist_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.grc_personnel_events ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.users(id);
ALTER TABLE public.grc_training_records ADD COLUMN IF NOT EXISTS evidence_id UUID REFERENCES public.grc_evidence(id);

ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS contained_at TIMESTAMPTZ;
ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS data_subjects_notified_at TIMESTAMPTZ;
ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE public.grc_incidents ADD COLUMN IF NOT EXISTS lessons_learned TEXT;

ALTER TABLE public.grc_bcdr_tests ADD COLUMN IF NOT EXISTS rto_target_minutes INT;
ALTER TABLE public.grc_bcdr_tests ADD COLUMN IF NOT EXISTS rto_actual_minutes INT;
ALTER TABLE public.grc_bcdr_tests ADD COLUMN IF NOT EXISTS rpo_target_minutes INT;
ALTER TABLE public.grc_bcdr_tests ADD COLUMN IF NOT EXISTS evidence_id UUID REFERENCES public.grc_evidence(id);

ALTER TABLE public.grc_internal_audits ADD COLUMN IF NOT EXISTS report_markdown TEXT;
ALTER TABLE public.grc_internal_audits ADD COLUMN IF NOT EXISTS completed_at DATE;

ALTER TABLE public.grc_objectives ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.grc_objectives ADD COLUMN IF NOT EXISTS current_value TEXT;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'grc_assets', 'grc_vendors', 'grc_vendor_assessments', 'grc_processing_activities', 'grc_dpias',
    'grc_data_subject_requests', 'grc_incidents', 'grc_bcdr_tests', 'grc_training_records', 'grc_personnel_events',
    'grc_internal_audits', 'grc_objectives', 'grc_corrective_actions', 'grc_evidence_requests', 'grc_findings',
    'grc_management_reviews', 'grc_exceptions', 'grc_risk_acceptances', 'grc_access_reviews', 'grc_access_review_items',
    'grc_soa_versions', 'grc_audit_packs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_delete', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.grc_deny_delete()', t || '_no_delete', t);
  END LOOP;
END $$;

-- ═══ 9. Evidence ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.grc_evidence_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES public.grc_evidence(id),
  reviewer_user_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grc_evidence_reviews_evidence_idx ON public.grc_evidence_reviews (evidence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS grc_evidence_control_idx ON public.grc_evidence (control_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.grc_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'GRC_INVALID: % is append-only', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS grc_evidence_reviews_append_only ON public.grc_evidence_reviews;
CREATE TRIGGER grc_evidence_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.grc_evidence_reviews
  FOR EACH ROW EXECUTE FUNCTION public.grc_append_only();

ALTER TABLE public.grc_evidence_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grc_evidence_reviews_select ON public.grc_evidence_reviews;
CREATE POLICY grc_evidence_reviews_select ON public.grc_evidence_reviews FOR SELECT TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.evidence.view')));

ALTER TABLE public.grc_evidence ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.grc_evidence ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.grc_evidence ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.grc_evidence ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.grc_evidence ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.grc_evidence ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

DROP POLICY IF EXISTS grc_evidence_insert ON public.grc_evidence;
CREATE POLICY grc_evidence_insert ON public.grc_evidence FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.grc_has_permission(auth.uid(), 'grc.evidence.submit'))
    AND submitted_by = auth.uid()
    AND status = 'submitted'
    AND source = 'manual'
    AND reviewed_by IS NULL
    AND content_sha256 ~ '^[0-9a-f]{64}$'
    AND (storage_path IS NULL OR storage_path LIKE 'evidence/%')
  );

CREATE OR REPLACE VIEW public.grc_evidence_current
WITH (security_invoker = true)
AS
SELECT
  e.*,
  COALESCE(rv.decision, 'pending') AS review_status,
  rv.reviewer_user_id AS last_reviewer_id,
  rv.created_at AS last_reviewed_at,
  rv.notes AS last_review_notes
FROM public.grc_evidence e
LEFT JOIN LATERAL (
  SELECT r.decision, r.reviewer_user_id, r.created_at, r.notes
  FROM public.grc_evidence_reviews r
  WHERE r.evidence_id = e.id
  ORDER BY r.created_at DESC
  LIMIT 1
) rv ON true;

GRANT SELECT ON public.grc_evidence_current TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grc_evidence_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.control_id IS NOT NULL THEN
    UPDATE public.grc_evidence_requests SET status = 'submitted'
    WHERE control_id = NEW.control_id AND status = 'open';
    UPDATE public.grc_controls SET last_evidence_at = NEW.created_at WHERE id = NEW.control_id;
  END IF;
  INSERT INTO public.grc_activity_log (actor_user_id, actor_label, action, entity_type, entity_id, metadata)
  VALUES (NEW.submitted_by, CASE WHEN NEW.source = 'collector' THEN 'collector' END, 'grc.evidence.submitted', 'grc_evidence', NEW.id::text,
    jsonb_build_object('control_id', NEW.control_id, 'sha256', NEW.content_sha256, 'source', NEW.source, 'path', NEW.storage_path));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_evidence_after_insert_trg ON public.grc_evidence;
CREATE TRIGGER grc_evidence_after_insert_trg
  AFTER INSERT ON public.grc_evidence
  FOR EACH ROW EXECUTE FUNCTION public.grc_evidence_after_insert();

CREATE OR REPLACE FUNCTION public.grc_review_evidence(p_evidence_id UUID, p_decision TEXT, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.evidence.review');
  e RECORD;
BEGIN
  IF p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'GRC_INVALID: decision must be accepted or rejected';
  END IF;
  SELECT * INTO e FROM public.grc_evidence WHERE id = p_evidence_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: evidence'; END IF;
  IF e.submitted_by = v_uid THEN RAISE EXCEPTION 'GRC_SOD: you cannot review evidence you submitted'; END IF;
  IF p_decision = 'rejected' AND length(trim(COALESCE(p_notes, ''))) = 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: explain what is wrong so the owner can resubmit';
  END IF;

  INSERT INTO public.grc_evidence_reviews (evidence_id, reviewer_user_id, decision, notes)
  VALUES (p_evidence_id, v_uid, p_decision, NULLIF(trim(COALESCE(p_notes, '')), ''));

  IF p_decision = 'rejected' AND e.control_id IS NOT NULL THEN
    INSERT INTO public.grc_evidence_requests (control_id, title, due_at, assignee_user_id, status)
    SELECT e.control_id, 'Resubmit evidence: ' || left(COALESCE(p_notes, ''), 160),
           NOW() + make_interval(days => public.grc_setting_int('evidence_request_lead_days', 14)),
           COALESCE(e.submitted_by, c.owner_user_id), 'open'
    FROM public.grc_controls c WHERE c.id = e.control_id;
  END IF;

  PERFORM public.grc_log('grc.evidence.' || p_decision, 'grc_evidence', p_evidence_id::text,
    jsonb_build_object('control_id', e.control_id, 'submitted_by', e.submitted_by));
END;
$$;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/json', 'application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'text/markdown',
  'application/zip', 'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'grc-evidence';

DROP POLICY IF EXISTS grc_evidence_bucket_insert ON storage.objects;
CREATE POLICY grc_evidence_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'grc-evidence'
    AND name LIKE 'evidence/%'
    AND public.grc_has_permission(auth.uid(), 'grc.evidence.submit')
  );

-- Audit packs live in the same bucket but are only served through the logged download route.
DROP POLICY IF EXISTS grc_evidence_bucket_select ON storage.objects;
CREATE POLICY grc_evidence_bucket_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'grc-evidence'
    AND name LIKE 'evidence/%'
    AND public.grc_has_permission(auth.uid(), 'grc.evidence.view')
  );

-- ═══ 10. Findings ════════════════════════════════════════════════════════════
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS control_id TEXT REFERENCES public.grc_controls(id);
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS asset_id TEXT REFERENCES public.grc_assets(id);
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS closure_notes TEXT;
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS retest_evidence_id UUID REFERENCES public.grc_evidence(id);
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);
ALTER TABLE public.grc_findings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS grc_findings_source_ref_unique
  ON public.grc_findings (source, external_ref) WHERE external_ref IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_findings_severity_check') THEN
    UPDATE public.grc_findings SET severity = 'medium' WHERE severity NOT IN ('critical', 'high', 'medium', 'low', 'info');
    ALTER TABLE public.grc_findings ADD CONSTRAINT grc_findings_severity_check
      CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_findings_status_check') THEN
    UPDATE public.grc_findings SET status = 'open' WHERE status NOT IN ('open', 'in_progress', 'risk_accepted', 'closed');
    ALTER TABLE public.grc_findings ADD CONSTRAINT grc_findings_status_check
      CHECK (status IN ('open', 'in_progress', 'risk_accepted', 'closed'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.grc_findings_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days INT;
BEGIN
  NEW.updated_at := NOW();
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
    IF NEW.due_at IS NULL THEN
      SELECT COALESCE((value ->> NEW.severity)::int, 90) INTO v_days FROM public.grc_settings WHERE key = 'finding_sla_days';
      NEW.due_at := NOW() + make_interval(days => COALESCE(v_days, 90));
    END IF;
  END IF;
  IF COALESCE(current_setting('grc.closing', true), '') <> 'on' AND auth.uid() IS NOT NULL THEN
    IF NEW.status = 'closed' AND (TG_OP = 'INSERT' OR OLD.status <> 'closed') THEN
      RAISE EXCEPTION 'GRC_INVALID: findings are closed through the close workflow';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'closed' THEN
      RAISE EXCEPTION 'GRC_INVALID: closed findings are locked; raise a new finding if the issue recurs';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_findings_guard_trg ON public.grc_findings;
CREATE TRIGGER grc_findings_guard_trg
  BEFORE INSERT OR UPDATE ON public.grc_findings
  FOR EACH ROW EXECUTE FUNCTION public.grc_findings_guard();

DROP POLICY IF EXISTS grc_findings_write ON public.grc_findings;
DROP POLICY IF EXISTS grc_findings_insert ON public.grc_findings;
CREATE POLICY grc_findings_insert ON public.grc_findings FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.findings.edit')));
DROP POLICY IF EXISTS grc_findings_update ON public.grc_findings;
CREATE POLICY grc_findings_update ON public.grc_findings FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.findings.edit')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.findings.edit')));

CREATE OR REPLACE FUNCTION public.grc_close_finding(p_finding_id UUID, p_notes TEXT, p_retest_evidence_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.findings.close');
  f RECORD;
BEGIN
  SELECT * INTO f FROM public.grc_findings WHERE id = p_finding_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: finding'; END IF;
  IF f.status = 'closed' THEN RAISE EXCEPTION 'GRC_INVALID: finding is already closed'; END IF;
  IF length(trim(COALESCE(p_notes, ''))) < 10 THEN
    RAISE EXCEPTION 'GRC_INVALID: describe how the finding was fixed (at least 10 characters)';
  END IF;
  IF f.severity IN ('critical', 'high') AND p_retest_evidence_id IS NULL THEN
    RAISE EXCEPTION 'GRC_INVALID: critical and high findings need retest evidence before closing';
  END IF;
  IF p_retest_evidence_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grc_evidence WHERE id = p_retest_evidence_id) THEN
    RAISE EXCEPTION 'GRC_NOT_FOUND: retest evidence';
  END IF;

  PERFORM set_config('grc.closing', 'on', true);
  UPDATE public.grc_findings
  SET status = 'closed', closed_by = v_uid, closed_at = NOW(), closure_notes = trim(p_notes), retest_evidence_id = p_retest_evidence_id
  WHERE id = p_finding_id;
  PERFORM set_config('grc.closing', 'off', true);

  PERFORM public.grc_log('grc.finding.closed', 'grc_finding', p_finding_id::text,
    jsonb_build_object('severity', f.severity, 'retest_evidence_id', p_retest_evidence_id));
END;
$$;

-- ═══ 11. Access reviews ══════════════════════════════════════════════════════
ALTER TABLE public.grc_access_reviews ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);
ALTER TABLE public.grc_access_reviews ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.grc_access_review_items ALTER COLUMN reviewer_user_id DROP NOT NULL;
ALTER TABLE public.grc_access_review_items ADD COLUMN IF NOT EXISTS platform_role TEXT;
ALTER TABLE public.grc_access_review_items ADD COLUMN IF NOT EXISTS grc_roles TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.grc_access_review_items ADD COLUMN IF NOT EXISTS subject_email TEXT;
ALTER TABLE public.grc_access_review_items ADD COLUMN IF NOT EXISTS subject_last_login_at TIMESTAMPTZ;
ALTER TABLE public.grc_access_review_items ADD COLUMN IF NOT EXISTS follow_up_finding_id UUID REFERENCES public.grc_findings(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_access_review_items_decision_check') THEN
    ALTER TABLE public.grc_access_review_items ADD CONSTRAINT grc_access_review_items_decision_check
      CHECK (decision IS NULL OR decision IN ('keep', 'modify', 'revoke'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS grc_access_review_items_unique ON public.grc_access_review_items (review_id, subject_user_id);

CREATE OR REPLACE FUNCTION public.grc_start_access_review(p_title TEXT, p_period_start DATE, p_period_end DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.access_reviews.decide');
  v_id UUID;
  v_n INT;
BEGIN
  IF length(trim(COALESCE(p_title, ''))) = 0 OR p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'GRC_INVALID: title and a valid period are required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.grc_access_reviews WHERE status = 'open') THEN
    RAISE EXCEPTION 'GRC_INVALID: finish the open access review before starting another';
  END IF;

  INSERT INTO public.grc_access_reviews (title, period_start, period_end, status, created_by)
  VALUES (trim(p_title), p_period_start, p_period_end, 'open', v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.grc_access_review_items (review_id, subject_user_id, platform_role, grc_roles, subject_email, subject_last_login_at)
  SELECT v_id, u.id, u.role::text,
         COALESCE((SELECT array_agg(a.grc_role ORDER BY a.grc_role) FROM public.grc_role_assignments a
                   WHERE a.user_id = u.id AND a.is_active AND (a.expires_at IS NULL OR a.expires_at > NOW())), '{}'),
         u.email, u.last_login_at
  FROM public.users u
  WHERE public.grc_is_admin_user(u.id);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM public.grc_log('grc.access_review.started', 'grc_access_review', v_id::text, jsonb_build_object('items', v_n));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grc_decide_access_review_item(p_item_id UUID, p_decision TEXT, p_notes TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.access_reviews.decide');
  it RECORD;
  v_finding UUID;
  v_remaining INT;
BEGIN
  IF p_decision NOT IN ('keep', 'modify', 'revoke') THEN
    RAISE EXCEPTION 'GRC_INVALID: decision must be keep, modify or revoke';
  END IF;
  SELECT i.*, r.status AS review_status INTO it
  FROM public.grc_access_review_items i JOIN public.grc_access_reviews r ON r.id = i.review_id
  WHERE i.id = p_item_id FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: access review item'; END IF;
  IF it.review_status <> 'open' THEN RAISE EXCEPTION 'GRC_INVALID: this review is closed'; END IF;
  IF it.decision IS NOT NULL THEN RAISE EXCEPTION 'GRC_INVALID: this item has already been decided'; END IF;
  IF it.subject_user_id = v_uid THEN RAISE EXCEPTION 'GRC_SOD: you cannot decide on your own access'; END IF;
  IF p_decision <> 'keep' AND length(trim(COALESCE(p_notes, ''))) = 0 THEN
    RAISE EXCEPTION 'GRC_INVALID: say what needs to change';
  END IF;

  IF p_decision <> 'keep' THEN
    INSERT INTO public.grc_findings (title, severity, status, source, description, external_ref)
    VALUES (
      'Access review: ' || p_decision || ' access for ' || COALESCE(it.subject_email, it.subject_user_id::text),
      'medium', 'open', 'access_review', trim(p_notes), it.id::text
    )
    ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
    RETURNING id INTO v_finding;
  END IF;

  UPDATE public.grc_access_review_items
  SET decision = p_decision, reviewer_user_id = v_uid, decided_at = NOW(),
      notes = NULLIF(trim(COALESCE(p_notes, '')), ''), follow_up_finding_id = v_finding
  WHERE id = p_item_id;

  SELECT count(*) INTO v_remaining FROM public.grc_access_review_items WHERE review_id = it.review_id AND decision IS NULL;
  IF v_remaining = 0 THEN
    UPDATE public.grc_access_reviews SET status = 'completed', completed_at = NOW() WHERE id = it.review_id;
  END IF;

  PERFORM public.grc_log('grc.access_review.decided', 'grc_access_review', it.review_id::text,
    jsonb_build_object('item_id', p_item_id, 'subject', it.subject_user_id, 'decision', p_decision, 'finding_id', v_finding));
END;
$$;

-- ═══ 12. Management reviews ══════════════════════════════════════════════════
ALTER TABLE public.grc_management_reviews ADD COLUMN IF NOT EXISTS attendees TEXT;
ALTER TABLE public.grc_management_reviews ADD COLUMN IF NOT EXISTS decisions_markdown TEXT;
ALTER TABLE public.grc_management_reviews ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);
ALTER TABLE public.grc_management_reviews ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.grc_management_reviews_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  IF COALESCE(current_setting('grc.approving', true), '') <> 'on' AND auth.uid() IS NOT NULL THEN
    IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
      RAISE EXCEPTION 'GRC_INVALID: management reviews are approved through the approval workflow';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
      RAISE EXCEPTION 'GRC_INVALID: approved management reviews are locked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grc_management_reviews_guard_trg ON public.grc_management_reviews;
CREATE TRIGGER grc_management_reviews_guard_trg
  BEFORE INSERT OR UPDATE ON public.grc_management_reviews
  FOR EACH ROW EXECUTE FUNCTION public.grc_management_reviews_guard();

DROP POLICY IF EXISTS grc_management_reviews_insert ON public.grc_management_reviews;
CREATE POLICY grc_management_reviews_insert ON public.grc_management_reviews FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.audits.edit')));
DROP POLICY IF EXISTS grc_management_reviews_update ON public.grc_management_reviews;
CREATE POLICY grc_management_reviews_update ON public.grc_management_reviews FOR UPDATE TO authenticated
  USING ((SELECT public.grc_has_permission(auth.uid(), 'grc.audits.edit')))
  WITH CHECK ((SELECT public.grc_has_permission(auth.uid(), 'grc.audits.edit')));

CREATE OR REPLACE FUNCTION public.grc_approve_management_review(p_review_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public.grc_require('grc.audits.edit');
  m RECORD;
BEGIN
  IF NOT public.grc_user_has_role(v_uid, 'management_approver') THEN
    RAISE EXCEPTION 'GRC_FORBIDDEN: only a management approver can sign off a management review';
  END IF;
  SELECT * INTO m FROM public.grc_management_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRC_NOT_FOUND: management review'; END IF;
  IF m.status = 'approved' THEN RAISE EXCEPTION 'GRC_INVALID: already approved'; END IF;
  IF m.created_by = v_uid THEN RAISE EXCEPTION 'GRC_SOD: the person who recorded the minutes cannot sign them off'; END IF;
  IF length(trim(COALESCE(m.minutes_markdown, ''))) < 50 THEN
    RAISE EXCEPTION 'GRC_INVALID: minutes must cover the ISO 27001 clause 9.3 inputs before sign-off';
  END IF;

  PERFORM set_config('grc.approving', 'on', true);
  UPDATE public.grc_management_reviews SET status = 'approved', approved_by = v_uid, approved_at = NOW() WHERE id = p_review_id;
  PERFORM set_config('grc.approving', 'off', true);
  PERFORM public.grc_log('grc.management_review.approved', 'grc_management_review', p_review_id::text, jsonb_build_object('review_date', m.review_date));
END;
$$;

-- ═══ 13. Audit packs ═════════════════════════════════════════════════════════
DROP POLICY IF EXISTS grc_audit_packs_insert ON public.grc_audit_packs;
CREATE POLICY grc_audit_packs_insert ON public.grc_audit_packs FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.grc_has_permission(auth.uid(), 'grc.audit_packs.generate'))
    AND requested_by = auth.uid()
    AND status = 'queued'
    AND period_end >= period_start
  );

ALTER TABLE public.grc_audit_packs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grc_audit_packs_status_check') THEN
    UPDATE public.grc_audit_packs SET status = 'failed' WHERE status NOT IN ('queued', 'building', 'ready', 'failed');
    ALTER TABLE public.grc_audit_packs ADD CONSTRAINT grc_audit_packs_status_check
      CHECK (status IN ('queued', 'building', 'ready', 'failed'));
  END IF;
END $$;

-- ═══ 14. Execute grants for workflow RPCs ════════════════════════════════════
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'grc_create_soa_draft(text)',
    'grc_publish_soa(uuid)',
    'grc_create_document(text, text, text, text, uuid, boolean)',
    'grc_create_document_version(uuid, text, text)',
    'grc_submit_document_version(uuid)',
    'grc_approve_document_version(uuid, date)',
    'grc_acknowledge_document(uuid)',
    'grc_propose_risk_acceptance(uuid, text, date)',
    'grc_decide_risk_acceptance(uuid, boolean, text)',
    'grc_review_evidence(uuid, text, text)',
    'grc_close_finding(uuid, text, uuid)',
    'grc_start_access_review(text, date, date)',
    'grc_decide_access_review_item(uuid, text, text)',
    'grc_approve_management_review(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

-- ═══ 15. Permission matrix ═══════════════════════════════════════════════════
-- BEGIN GENERATED GRC ROLE PERMISSIONS (node scripts/generate-grc-rbac-seed.mjs — do not edit by hand)
DELETE FROM public.grc_role_permissions;
INSERT INTO public.grc_role_permissions (grc_role, permission_key)
VALUES
  ('grc_admin', 'grc.overview.view'),
  ('grc_admin', 'grc.controls.view'),
  ('grc_admin', 'grc.controls.edit'),
  ('grc_admin', 'grc.documents.view'),
  ('grc_admin', 'grc.documents.edit'),
  ('grc_admin', 'grc.documents.approve'),
  ('grc_admin', 'grc.risks.view'),
  ('grc_admin', 'grc.risks.edit'),
  ('grc_admin', 'grc.risks.accept'),
  ('grc_admin', 'grc.assets.view'),
  ('grc_admin', 'grc.assets.edit'),
  ('grc_admin', 'grc.vendors.view'),
  ('grc_admin', 'grc.vendors.edit'),
  ('grc_admin', 'grc.privacy.view'),
  ('grc_admin', 'grc.privacy.edit'),
  ('grc_admin', 'grc.evidence.view'),
  ('grc_admin', 'grc.evidence.submit'),
  ('grc_admin', 'grc.evidence.review'),
  ('grc_admin', 'grc.access_reviews.view'),
  ('grc_admin', 'grc.access_reviews.decide'),
  ('grc_admin', 'grc.findings.view'),
  ('grc_admin', 'grc.findings.edit'),
  ('grc_admin', 'grc.findings.close'),
  ('grc_admin', 'grc.incidents.view'),
  ('grc_admin', 'grc.incidents.edit'),
  ('grc_admin', 'grc.people.view'),
  ('grc_admin', 'grc.people.edit'),
  ('grc_admin', 'grc.audits.view'),
  ('grc_admin', 'grc.audits.edit'),
  ('grc_admin', 'grc.audit_packs.generate'),
  ('grc_admin', 'grc.settings.manage'),
  ('grc_admin', 'grc.assignments.manage'),
  ('security_lead', 'grc.overview.view'),
  ('security_lead', 'grc.controls.view'),
  ('security_lead', 'grc.controls.edit'),
  ('security_lead', 'grc.documents.view'),
  ('security_lead', 'grc.documents.edit'),
  ('security_lead', 'grc.documents.approve'),
  ('security_lead', 'grc.risks.view'),
  ('security_lead', 'grc.assets.view'),
  ('security_lead', 'grc.vendors.view'),
  ('security_lead', 'grc.evidence.view'),
  ('security_lead', 'grc.evidence.review'),
  ('security_lead', 'grc.access_reviews.view'),
  ('security_lead', 'grc.findings.view'),
  ('security_lead', 'grc.findings.edit'),
  ('security_lead', 'grc.findings.close'),
  ('security_lead', 'grc.incidents.view'),
  ('security_lead', 'grc.incidents.edit'),
  ('security_lead', 'grc.people.view'),
  ('security_lead', 'grc.audits.view'),
  ('risk_manager', 'grc.overview.view'),
  ('risk_manager', 'grc.controls.view'),
  ('risk_manager', 'grc.documents.view'),
  ('risk_manager', 'grc.risks.view'),
  ('risk_manager', 'grc.risks.edit'),
  ('risk_manager', 'grc.risks.accept'),
  ('risk_manager', 'grc.assets.view'),
  ('risk_manager', 'grc.vendors.view'),
  ('risk_manager', 'grc.vendors.edit'),
  ('risk_manager', 'grc.evidence.view'),
  ('risk_manager', 'grc.findings.view'),
  ('risk_manager', 'grc.incidents.view'),
  ('risk_manager', 'grc.audits.view'),
  ('risk_manager', 'grc.audits.edit'),
  ('privacy_officer', 'grc.overview.view'),
  ('privacy_officer', 'grc.controls.view'),
  ('privacy_officer', 'grc.documents.view'),
  ('privacy_officer', 'grc.privacy.view'),
  ('privacy_officer', 'grc.privacy.edit'),
  ('privacy_officer', 'grc.assets.view'),
  ('privacy_officer', 'grc.vendors.view'),
  ('privacy_officer', 'grc.evidence.view'),
  ('privacy_officer', 'grc.evidence.submit'),
  ('privacy_officer', 'grc.findings.view'),
  ('privacy_officer', 'grc.incidents.view'),
  ('privacy_officer', 'grc.incidents.edit'),
  ('it_operations', 'grc.overview.view'),
  ('it_operations', 'grc.controls.view'),
  ('it_operations', 'grc.documents.view'),
  ('it_operations', 'grc.assets.view'),
  ('it_operations', 'grc.assets.edit'),
  ('it_operations', 'grc.evidence.view'),
  ('it_operations', 'grc.evidence.submit'),
  ('it_operations', 'grc.access_reviews.view'),
  ('it_operations', 'grc.access_reviews.decide'),
  ('it_operations', 'grc.findings.view'),
  ('it_operations', 'grc.findings.edit'),
  ('it_operations', 'grc.incidents.view'),
  ('it_operations', 'grc.incidents.edit'),
  ('it_operations', 'grc.people.view'),
  ('it_operations', 'grc.people.edit'),
  ('architecture', 'grc.overview.view'),
  ('architecture', 'grc.controls.view'),
  ('architecture', 'grc.documents.view'),
  ('architecture', 'grc.risks.view'),
  ('architecture', 'grc.assets.view'),
  ('architecture', 'grc.assets.edit'),
  ('architecture', 'grc.evidence.view'),
  ('architecture', 'grc.evidence.submit'),
  ('architecture', 'grc.findings.view'),
  ('architecture', 'grc.findings.edit'),
  ('management_approver', 'grc.overview.view'),
  ('management_approver', 'grc.controls.view'),
  ('management_approver', 'grc.documents.view'),
  ('management_approver', 'grc.risks.view'),
  ('management_approver', 'grc.assets.view'),
  ('management_approver', 'grc.vendors.view'),
  ('management_approver', 'grc.privacy.view'),
  ('management_approver', 'grc.evidence.view'),
  ('management_approver', 'grc.access_reviews.view'),
  ('management_approver', 'grc.findings.view'),
  ('management_approver', 'grc.incidents.view'),
  ('management_approver', 'grc.people.view'),
  ('management_approver', 'grc.audits.view'),
  ('management_approver', 'grc.documents.approve'),
  ('management_approver', 'grc.risks.accept'),
  ('management_approver', 'grc.audits.edit'),
  ('contributor', 'grc.overview.view'),
  ('contributor', 'grc.controls.view'),
  ('contributor', 'grc.documents.view'),
  ('contributor', 'grc.evidence.view'),
  ('contributor', 'grc.evidence.submit'),
  ('viewer', 'grc.overview.view'),
  ('viewer', 'grc.controls.view'),
  ('viewer', 'grc.documents.view'),
  ('viewer', 'grc.risks.view'),
  ('viewer', 'grc.assets.view'),
  ('viewer', 'grc.vendors.view'),
  ('viewer', 'grc.privacy.view'),
  ('viewer', 'grc.evidence.view'),
  ('viewer', 'grc.access_reviews.view'),
  ('viewer', 'grc.findings.view'),
  ('viewer', 'grc.incidents.view'),
  ('viewer', 'grc.people.view'),
  ('viewer', 'grc.audits.view');
-- END GENERATED GRC ROLE PERMISSIONS
