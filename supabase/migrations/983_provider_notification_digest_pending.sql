-- Provider push digest queue: defer instant booking pushes when digest_mode is daily/weekly.

CREATE TABLE IF NOT EXISTS public.provider_notification_digest_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  digest_mode text NOT NULL CHECK (digest_mode IN ('daily', 'weekly')),
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_notification_digest_pending_dedupe
  ON public.provider_notification_digest_pending (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_provider_notification_digest_pending_mode_created
  ON public.provider_notification_digest_pending (digest_mode, created_at);

ALTER TABLE public.provider_notification_digest_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_notification_digest_pending_service_role
  ON public.provider_notification_digest_pending;

CREATE POLICY provider_notification_digest_pending_service_role
  ON public.provider_notification_digest_pending
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.provider_notification_digest_pending IS
  'Deferred provider-app push notifications batched into daily/weekly digests per user notification_preferences.digest_mode.';
