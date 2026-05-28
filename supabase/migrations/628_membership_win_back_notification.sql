-- Customer notification when a provider sends a membership win-back reminder.
INSERT INTO public.notification_templates (
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  sms_body,
  variables,
  url,
  enabled,
  description
)
SELECT
  'membership_win_back',
  'Membership Win-Back',
  '{{provider_name}} invited you to rejoin {{membership_name}}. Tap to view plans.',
  ARRAY['push', 'email']::TEXT[],
  'You''re invited back to {{membership_name}}',
  '<h2>We''d love to have you back</h2><p>{{provider_name}} has a membership offer waiting for you.</p><p><strong>Plan:</strong> {{membership_name}}</p><p>{{message}}</p>',
  NULL,
  ARRAY['provider_name', 'membership_name', 'message', 'plans_url']::TEXT[],
  '/membership',
  true,
  'Sent when a provider sends a win-back reminder to a cancelled member'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = 'membership_win_back'
);

UPDATE public.notification_templates
SET enabled = true, updated_at = NOW()
WHERE key = 'membership_win_back' AND enabled IS DISTINCT FROM true;
