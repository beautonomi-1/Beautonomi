-- Softer rebook_reminder copy (one provider-named check-in, one book link).

UPDATE public.notification_templates
SET
  title = 'Time for your next visit?',
  body = 'Hi — {{provider_name}} thought you might be ready to book {{service_title}} again.',
  email_subject = 'Book {{service_title}} with {{provider_name}}',
  email_body = '<p>Hi,</p><p><strong>{{provider_name}}</strong> thought you might be ready for <strong>{{service_title}}</strong> again.</p><p><a href="{{booking_url}}">Book your next visit</a></p>',
  updated_at = NOW()
WHERE tenant_id IS NULL
  AND key = 'rebook_reminder';
