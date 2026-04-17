-- F29 — Soft-delete policy baseline.
--
-- Adds deleted_at + filtered *_active views to the in-scope entity tables.
-- See docs/POLICIES/SOFT_DELETE.md for the full policy.

DO $$
DECLARE
  t text;
  v_tables text[] := ARRAY[
    'users',
    'providers',
    'offerings',
    'products',
    'provider_locations',
    'provider_staff',
    'booking_holds'
  ];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_at) WHERE deleted_at IS NOT NULL',
        'idx_' || t || '_deleted_at', t);
      EXECUTE format('CREATE OR REPLACE VIEW public.%I_active AS SELECT * FROM public.%I WHERE deleted_at IS NULL', t, t);
    END IF;
  END LOOP;
END $$;

-- Generic soft-delete helper. Example: SELECT public.soft_delete('providers', '<uuid>', 'merged with another profile');

CREATE OR REPLACE FUNCTION public.soft_delete(
  p_table  text,
  p_id     uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allowed text[] := ARRAY[
    'users','providers','offerings','products',
    'provider_locations','provider_staff','booking_holds'
  ];
BEGIN
  IF NOT (p_table = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'soft_delete not supported for table %', p_table USING ERRCODE = '42501';
  END IF;

  EXECUTE format('UPDATE public.%I SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', p_table)
    USING p_id;

  -- Lightweight audit log; tolerate absence of audit_logs table.
  BEGIN
    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata, created_at)
    VALUES (auth.uid(), 'soft_delete', p_table, p_id, jsonb_build_object('reason', p_reason), now());
  EXCEPTION WHEN undefined_table THEN
    -- audit_logs doesn't exist in some envs — skip.
    NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete(text, uuid, text) TO service_role, authenticated;

COMMENT ON FUNCTION public.soft_delete IS
  'F29: sets deleted_at=now() on an in-scope entity. See docs/POLICIES/SOFT_DELETE.md.';
