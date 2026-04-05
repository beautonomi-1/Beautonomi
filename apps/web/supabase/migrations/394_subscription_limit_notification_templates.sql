-- Push/email templates for provider subscription usage (warning ≥80% and at cap).

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
) VALUES (
  'provider_subscription_limit_warning',
  'You''re nearing your plan limit',
  '{{plan_name}}: {{feature_label}} are at {{percent_used}}% ({{current_usage}}/{{limit_value}}) this month. {{upgrade_cta}}',
  ARRAY['push', 'email']::TEXT[],
  'Nearing your Beautonomi plan limit',
  '<p>Hi,</p>
<p>Your <strong>{{plan_name}}</strong> usage for <strong>{{feature_label}}</strong> is at <strong>{{percent_used}}%</strong> ({{current_usage}} of {{limit_value}}) this month.</p>
<p>{{upgrade_cta}}</p>
<p><a href="{{app_url}}/provider/subscription">Review plans &amp; upgrade</a></p>',
  'Beautonomi: {{feature_label}} at {{percent_used}}% ({{current_usage}}/{{limit_value}}). Upgrade in the app.',
  ARRAY['plan_name', 'feature_label', 'current_usage', 'limit_value', 'percent_used', 'upgrade_cta', 'app_url']::TEXT[],
  '/provider/subscription',
  TRUE,
  'Provider: usage at or above 80% of a capped feature (bookings, messages, staff, locations).'
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = NOW();

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
) VALUES (
  'provider_subscription_limit_reached',
  'You''ve hit your plan limit',
  '{{plan_name}}: you''ve reached {{current_usage}}/{{limit_value}} for {{feature_label}} this month. Upgrade to accept more.',
  ARRAY['push', 'email']::TEXT[],
  'Plan limit reached — Beautonomi',
  '<p>Hi,</p>
<p>You''ve reached your <strong>{{plan_name}}</strong> limit for <strong>{{feature_label}}</strong> this month: <strong>{{current_usage}}/{{limit_value}}</strong>.</p>
<p>{{upgrade_cta}}</p>
<p><a href="{{app_url}}/provider/subscription">Upgrade your subscription</a></p>',
  'Beautonomi: limit reached for {{feature_label}} ({{current_usage}}/{{limit_value}}). Upgrade in the app.',
  ARRAY['plan_name', 'feature_label', 'current_usage', 'limit_value', 'upgrade_cta', 'app_url']::TEXT[],
  '/provider/subscription',
  TRUE,
  'Provider: usage reached the cap for a limited feature this month.'
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = NOW();
