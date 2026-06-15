-- Ensure everyday transactional notification templates exist as enabled global rows.
-- Fixes silent no-op when sendTemplateNotification cannot resolve a template
-- (broadcast pushes bypass template lookup entirely).
--
-- Uses partial unique index uniq_notification_templates_global (key) WHERE tenant_id IS NULL.

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
    'booking_confirmed',
    'Booking confirmed',
    'Your appointment with {{provider_name}} is confirmed for {{booking_date}} at {{booking_time}}.',
    ARRAY['push', 'email']::TEXT[],
    'Booking confirmed — {{booking_number}}',
    '<p>Your appointment with <strong>{{provider_name}}</strong> is confirmed for {{booking_date}} at {{booking_time}}.</p>',
    ARRAY['provider_name', 'booking_date', 'booking_time', 'booking_number', 'booking_id']::TEXT[],
    '/bookings/{{booking_id}}',
    true,
    'Customer booking confirmation'
  ),
  (
    NULL,
    'booking_reminder_24h',
    'Appointment reminder',
    'Reminder: appointment with {{provider_name}} on {{booking_date}}.',
    ARRAY['push', 'email']::TEXT[],
    'Appointment reminder',
    '<p>Reminder: you have an appointment with {{provider_name}} on {{booking_date}}.</p>',
    ARRAY['provider_name', 'booking_date', 'booking_time', 'location', 'booking_id']::TEXT[],
    '/bookings/{{booking_id}}',
    true,
    '24h booking reminder'
  ),
  (
    NULL,
    'booking_reminder_2h',
    'Appointment soon',
    'Your appointment with {{provider_name}} is in 2 hours.',
    ARRAY['push']::TEXT[],
    NULL,
    NULL,
    ARRAY['provider_name', 'booking_time', 'location', 'booking_id']::TEXT[],
    '/bookings/{{booking_id}}',
    true,
    '2h booking reminder'
  ),
  (
    NULL,
    'booking_cancelled',
    'Booking cancelled',
    'Your booking {{booking_number}} has been cancelled.',
    ARRAY['push', 'email']::TEXT[],
    'Booking cancelled',
    '<p>Your booking {{booking_number}} has been cancelled.</p>',
    ARRAY['provider_name', 'booking_date', 'booking_number', 'refund_info', 'booking_id']::TEXT[],
    '/bookings/{{booking_id}}',
    true,
    'Booking cancelled (generic)'
  ),
  (
    NULL,
    'provider_booking_request',
    'New booking',
    'New booking from {{customer_name}} on {{booking_date}} at {{booking_time}}.',
    ARRAY['push']::TEXT[],
    NULL,
    NULL,
    ARRAY['customer_name', 'booking_date', 'booking_time', 'services', 'total_amount', 'booking_id']::TEXT[],
    '/provider/bookings/{{booking_id}}',
    true,
    'Provider new booking request'
  ),
  (
    NULL,
    'new_booking',
    'New booking',
    'You have a new booking from {{customer_name}}.',
    ARRAY['push']::TEXT[],
    NULL,
    NULL,
    ARRAY['customer_name', 'booking_date', 'booking_time', 'booking_id']::TEXT[],
    '/provider/bookings/{{booking_id}}',
    true,
    'Provider new booking alias'
  ),
  (
    NULL,
    'customer_new_message',
    'New message',
    '{{provider_name}}: {{message_preview}}',
    ARRAY['push', 'email']::TEXT[],
    'New message from {{provider_name}}',
    '<p><strong>{{provider_name}}</strong> sent you a message.</p>',
    ARRAY['provider_name', 'message_preview', 'conversation_id']::TEXT[],
    '/account-settings/messages?conversation={{conversation_id}}',
    true,
    'Customer chat message'
  ),
  (
    NULL,
    'provider_new_message',
    'New message',
    '{{sender_name}}: {{message_preview}}',
    ARRAY['push', 'email']::TEXT[],
    'New message on Beautonomi',
    '<p>New message from <strong>{{sender_name}}</strong>.</p>',
    ARRAY['sender_name', 'message_preview', 'conversation_id']::TEXT[],
    '/provider/messaging',
    true,
    'Provider chat message'
  ),
  (
    NULL,
    'payment_successful',
    'Payment successful',
    'Your payment for booking {{booking_number}} was successful.',
    ARRAY['push']::TEXT[],
    NULL,
    NULL,
    ARRAY['amount', 'booking_number', 'booking_id', 'payment_method', 'transaction_id']::TEXT[],
    '/account-settings/bookings',
    true,
    'Payment success'
  ),
  (
    NULL,
    'payment_failed',
    'Payment failed',
    'Your payment could not be processed. Please try again.',
    ARRAY['push']::TEXT[],
    NULL,
    NULL,
    ARRAY['amount', 'booking_number', 'booking_id', 'failure_reason']::TEXT[],
    '/account-settings/bookings',
    true,
    'Payment failure'
  )
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  enabled = true,
  channels = EXCLUDED.channels,
  title = COALESCE(NULLIF(EXCLUDED.title, ''), notification_templates.title),
  body = COALESCE(NULLIF(EXCLUDED.body, ''), notification_templates.body),
  url = COALESCE(NULLIF(EXCLUDED.url, ''), notification_templates.url),
  updated_at = NOW();

-- Re-enable any globally seeded templates that were accidentally disabled.
UPDATE public.notification_templates
SET enabled = true, updated_at = NOW()
WHERE tenant_id IS NULL
  AND key IN (
    'booking_confirmed',
    'booking_reminder_24h',
    'booking_reminder_2h',
    'booking_cancelled',
    'booking_cancelled_by_customer',
    'booking_cancelled_by_provider',
    'booking_rescheduled',
    'provider_booking_request',
    'provider_booking_cancelled',
    'new_booking',
    'customer_new_message',
    'provider_new_message',
    'new_message',
    'payment_successful',
    'payment_failed',
    'service_completed',
    'provider_new_review'
  )
  AND enabled = false;
