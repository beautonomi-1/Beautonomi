-- Global templates for in-app / email / push messaging (customer ↔ provider).
-- Code paths: apps/web POST /api/me/messages, POST /api/provider/conversations/[id]/messages
-- (see provider_new_message, customer_new_message in onesignal + message routes).
--
-- Ensures rows exist for fresh installs and sets enabled = true on apply so pushes are not skipped
-- by getNotificationTemplate(..., enabled: true).

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
VALUES
(
  NULL,
  'provider_new_message',
  'New message',
  'New message from {{sender_name}}: {{message_preview}}',
  ARRAY['push', 'email']::TEXT[],
  'New message on Beautonomi',
  '<p>You have a new message from <strong>{{sender_name}}</strong>.</p><p><strong>Preview:</strong> {{message_preview}}</p>',
  ARRAY['sender_name', 'message_preview', 'conversation_id']::TEXT[],
  '/provider/messaging',
  true,
  'Customer → provider team messaging; push uses provider OneSignal app.'
),
(
  NULL,
  'customer_new_message',
  'New message',
  '{{provider_name}} messaged you: {{message_preview}}',
  ARRAY['push', 'email']::TEXT[],
  'New message from {{provider_name}}',
  '<p><strong>{{provider_name}}</strong> sent you a message.</p><p><strong>Preview:</strong> {{message_preview}}</p>',
  ARRAY['provider_name', 'message_preview', 'conversation_id']::TEXT[],
  '/account-settings/messages?conversation={{conversation_id}}',
  true,
  'Provider → customer messaging; push uses customer OneSignal app.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();
