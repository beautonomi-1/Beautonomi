-- Align payment_pending template with /bookings/:id/pay, SMS, and {{payment_link}} for send-payment-link

UPDATE public.notification_templates
SET
  body = 'Your payment of {{amount}} for booking #{{booking_number}} is pending. Pay now: {{payment_link}}',
  channels = ARRAY['push', 'email', 'sms']::TEXT[],
  email_body = '<h2>Payment pending</h2><p>Please complete your payment for booking <strong>#{{booking_number}}</strong>.</p><p><strong>Amount:</strong> {{amount}}</p><p><a href="{{payment_link}}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Pay now</a></p><p style="font-size:12px;color:#666;">If the button does not work, copy this link:<br/>{{payment_link}}</p>',
  sms_body = '{{amount}} for booking #{{booking_number}}. Pay: {{payment_link}}',
  variables = ARRAY['amount', 'booking_number', 'payment_method', 'booking_id', 'payment_link']::TEXT[],
  url = '/bookings/{{booking_id}}/pay',
  description = 'Sent when provider sends payment link; push/email/SMS include pay URL',
  updated_at = NOW()
WHERE key = 'payment_pending';
