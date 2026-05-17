-- Ensure critical payment, messaging, and custom-offer templates exist and stay enabled.
-- This migration is intentionally idempotent.

INSERT INTO public.notification_templates (
  key,
  title,
  body,
  channels,
  variables,
  url,
  enabled,
  description
)
VALUES
  (
    'payment_successful',
    'Payment Successful',
    'Your payment has been processed successfully.',
    ARRAY['push']::TEXT[],
    ARRAY['amount','booking_number','booking_id','payment_method']::TEXT[],
    '/account-settings/bookings',
    true,
    'Transactional payment success notification'
  ),
  (
    'payment_failed',
    'Payment Failed',
    'Your payment failed. Please try again.',
    ARRAY['push']::TEXT[],
    ARRAY['amount','booking_number','booking_id','failure_reason']::TEXT[],
    '/account-settings/bookings',
    true,
    'Transactional payment failure notification'
  ),
  (
    'provider_new_message',
    'New Message from Customer',
    '{{sender_name}} sent you a message: {{message_preview}}',
    ARRAY['push']::TEXT[],
    ARRAY['sender_name','message_preview','conversation_id']::TEXT[],
    '/provider/messaging',
    true,
    'Provider-facing chat message notification'
  ),
  (
    'customer_new_message',
    'New Message from Provider',
    '{{provider_name}} sent you a message: {{message_preview}}',
    ARRAY['push']::TEXT[],
    ARRAY['provider_name','message_preview','conversation_id']::TEXT[],
    '/account-settings/messages',
    true,
    'Customer-facing chat message notification'
  ),
  (
    'customer_custom_offer',
    'Custom Offer Received',
    '{{provider_name}} sent you a custom offer.',
    ARRAY['push']::TEXT[],
    ARRAY['provider_name','price','currency','request_id','offer_id']::TEXT[],
    '/account-settings/custom-requests',
    true,
    'Customer custom-offer notification'
  )
ON CONFLICT (key) DO UPDATE
SET
  enabled = true,
  channels = EXCLUDED.channels,
  updated_at = NOW();
