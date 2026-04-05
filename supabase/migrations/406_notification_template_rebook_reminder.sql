-- Template for automated rebook nudges (see sendRebookReminders in apps/web)

-- Global templates use partial unique index uniq_notification_templates_global (key) WHERE tenant_id IS NULL (see 354).
INSERT INTO public.notification_templates (
  tenant_id,
  key,
  title,
  body,
  channels,
  email_subject,
  email_body,
  variables,
  url,
  enabled,
  description
)
VALUES (
  NULL,
  'rebook_reminder',
  'Time to book again?',
  'It may be time to book {{service_title}} again with {{provider_name}}.',
  ARRAY['push', 'email']::TEXT[],
  'Rebook {{service_title}}',
  '<p>Hi,</p><p>Your provider suggested checking in about <strong>{{service_title}}</strong>.</p><p><strong>{{provider_name}}</strong></p><p><a href="{{booking_url}}">Book again</a></p>',
  ARRAY['provider_name', 'service_title', 'service_id', 'provider_slug', 'booking_id', 'booking_url']::TEXT[],
  '{{booking_url}}',
  true,
  'Sent when completed_at + reminder_to_rebook_weeks matches today and offering.reminder_to_rebook_enabled is true'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = NOW();
