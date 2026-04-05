-- Inactivity retention: warn after 6 months without sign-in; optional archive after 30-day notice.
-- Uses auth.users.last_sign_in_at (Supabase-maintained). COALESCE with users.created_at for edge cases.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS inactivity_archive_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_data_archive_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.inactivity_archive_warning_sent_at IS 'When the 30-day inactivity archive warning was sent (email/push).';
COMMENT ON COLUMN public.users.scheduled_data_archive_at IS 'If set and in the past, user is eligible for automated inactive retention archive (cron).';

CREATE INDEX IF NOT EXISTS idx_users_scheduled_data_archive_at
  ON public.users (scheduled_data_archive_at)
  WHERE scheduled_data_archive_at IS NOT NULL AND deactivated_at IS NULL;

-- Atomically claim users for warning (idempotent batching; SKIP LOCKED for concurrent cron).
CREATE OR REPLACE FUNCTION public.claim_inactivity_retention_warnings(p_limit integer DEFAULT 200)
RETURNS TABLE (
  user_id uuid,
  email text,
  role public.user_role,
  scheduled_data_archive_at timestamptz,
  inactivity_archive_warning_sent_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT u.id
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.id
    WHERE u.deactivated_at IS NULL
      AND u.inactivity_archive_warning_sent_at IS NULL
      AND u.role NOT IN ('superadmin', 'support_agent')
      AND COALESCE(au.last_sign_in_at, u.created_at) < (NOW() - INTERVAL '6 months')
      AND u.created_at < (NOW() - INTERVAL '6 months')
    ORDER BY u.id
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE OF u SKIP LOCKED
  )
  UPDATE public.users u
  SET
    inactivity_archive_warning_sent_at = NOW(),
    scheduled_data_archive_at = NOW() + INTERVAL '30 days'
  FROM picked p
  WHERE u.id = p.id
  RETURNING
    u.id AS user_id,
    u.email,
    u.role,
    u.scheduled_data_archive_at,
    u.inactivity_archive_warning_sent_at;
$$;

REVOKE ALL ON FUNCTION public.claim_inactivity_retention_warnings(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_inactivity_retention_warnings(integer) TO service_role;

-- Deactivate accounts whose archive date passed and who have not signed in since the warning was sent.
CREATE OR REPLACE FUNCTION public.run_inactivity_retention_archives()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  WITH targets AS (
    SELECT u.id
    FROM public.users u
    INNER JOIN auth.users au ON au.id = u.id
    WHERE u.deactivated_at IS NULL
      AND u.scheduled_data_archive_at IS NOT NULL
      AND u.scheduled_data_archive_at <= NOW()
      AND u.inactivity_archive_warning_sent_at IS NOT NULL
      AND u.role NOT IN ('superadmin', 'support_agent')
      AND NOT (
        au.last_sign_in_at IS NOT NULL
        AND au.last_sign_in_at > u.inactivity_archive_warning_sent_at
      )
  )
  UPDATE public.users u
  SET
    deactivated_at = NOW(),
    deactivation_reason = 'inactive_retention'
  FROM targets t
  WHERE u.id = t.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.run_inactivity_retention_archives() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_inactivity_retention_archives() TO service_role;

-- Idempotent global template (tenant_id IS NULL). Column comes from 354; add if this DB has not run 354 yet.
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

UPDATE public.notification_templates
SET
  title = 'Keep your Beautonomi account',
  body = 'We''re tidying up our Beautonomi community. Since you haven''t logged in for a while, we''ll archive your data in 30 days to keep your digital space clean. If you want to keep your account, open this message and tap the link to stay.',
  channels = ARRAY['push', 'email']::TEXT[],
  email_subject = 'Your Beautonomi account — action in 30 days',
  email_body = '<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111"><div style="max-width:560px;margin:24px auto;padding:24px"><h2 style="margin:0 0 12px">Beautonomi</h2><p>We''re tidying up our Beautonomi community. Since you haven''t logged in for a while, we''ll archive your data in 30 days to keep your digital space clean.</p><p>If you want to keep your account, tap below to stay.</p><p style="margin:28px 0"><a href="{{keep_active_url}}" style="display:inline-block;padding:14px 22px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Keep my account</a></p><p style="font-size:13px;color:#666">If the button doesn''t work, copy this link:<br/><span style="word-break:break-all">{{keep_active_url}}</span></p><p style="font-size:13px;color:#666">— The Beautonomi team</p></div></body></html>',
  variables = ARRAY['keep_active_url', 'app_url']::TEXT[],
  url = '{{keep_active_url}}',
  enabled = true,
  description = 'Sent when a user has not signed in for 6+ months; 30-day window before inactive retention archive.',
  updated_at = NOW()
WHERE key = 'account_inactivity_archive_warning' AND tenant_id IS NULL;

INSERT INTO public.notification_templates (
  key, title, body, channels, email_subject, email_body, variables, url, enabled, description, tenant_id
)
SELECT
  'account_inactivity_archive_warning',
  'Keep your Beautonomi account',
  'We''re tidying up our Beautonomi community. Since you haven''t logged in for a while, we''ll archive your data in 30 days to keep your digital space clean. If you want to keep your account, open this message and tap the link to stay.',
  ARRAY['push', 'email']::TEXT[],
  'Your Beautonomi account — action in 30 days',
  '<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111"><div style="max-width:560px;margin:24px auto;padding:24px"><h2 style="margin:0 0 12px">Beautonomi</h2><p>We''re tidying up our Beautonomi community. Since you haven''t logged in for a while, we''ll archive your data in 30 days to keep your digital space clean.</p><p>If you want to keep your account, tap below to stay.</p><p style="margin:28px 0"><a href="{{keep_active_url}}" style="display:inline-block;padding:14px 22px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Keep my account</a></p><p style="font-size:13px;color:#666">If the button doesn''t work, copy this link:<br/><span style="word-break:break-all">{{keep_active_url}}</span></p><p style="font-size:13px;color:#666">— The Beautonomi team</p></div></body></html>',
  ARRAY['keep_active_url', 'app_url']::TEXT[],
  '{{keep_active_url}}',
  true,
  'Sent when a user has not signed in for 6+ months; 30-day window before inactive retention archive.',
  NULL::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates t
  WHERE t.key = 'account_inactivity_archive_warning' AND t.tenant_id IS NULL
);
