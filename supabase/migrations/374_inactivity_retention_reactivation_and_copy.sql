-- Inactivity retention: mark lapse as inactive_retention (self-serve reactivate), clearer user-facing copy.

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
    deactivation_reason = 'inactive_retention',
    deactivated_by = 'inactive_retention',
    is_active = false
  FROM targets t
  WHERE u.id = t.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Align notification copy with behaviour: account deactivation (not anonymisation-only); reactivation after lapse is self-serve.
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

UPDATE public.notification_templates
SET
  title = 'Keep your Beautonomi account active',
  body = 'We''re tidying inactive Beautonomi accounts. Because you haven''t signed in for a while, we''ll deactivate your account in 30 days (you won''t be able to book or sign in until you reactivate). To stay active, sign in or tap below. If your account is deactivated later, you can sign in again and reactivate in a few steps.',
  email_subject = 'Action needed: keep your Beautonomi account',
  email_body = '<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111"><div style="max-width:560px;margin:24px auto;padding:24px"><h2 style="margin:0 0 12px">Beautonomi</h2><p>We''re tidying inactive accounts to keep the platform safe and relevant.</p><p><strong>Because you haven''t signed in for a long time, we''ll deactivate your account in 30 days.</strong> While deactivated, you won''t be able to use the app or website until you reactivate (a quick step after you sign in again).</p><p>This is <strong>not</strong> the same as deleting your data on the spot — it limits access until you return.</p><p>If you want to stay active now, sign in or tap below.</p><p style="margin:28px 0"><a href="{{keep_active_url}}" style="display:inline-block;padding:14px 22px;background:#111;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Keep my account active</a></p><p style="font-size:13px;color:#666">If the button doesn''t work, copy this link:<br/><span style="word-break:break-all">{{keep_active_url}}</span></p><p style="font-size:13px;color:#666">— The Beautonomi team</p></div></body></html>',
  description = '6+ months inactive: 30-day notice before account deactivation (inactive_retention); user may reactivate after signing in.',
  updated_at = NOW()
WHERE key = 'account_inactivity_archive_warning' AND tenant_id IS NULL;
