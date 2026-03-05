-- Notification template for Paystack subscription.expiring_cards webhook
-- Variables: expiry_date, description, customer_email, app_url, year
INSERT INTO public.notification_templates (
  key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description
) VALUES (
  'subscription_card_expiring',
  'Your Subscription Card Is Expiring',
  'The card on your subscription ({{description}}) expires on {{expiry_date}}. Please update your payment method to avoid interruption.',
  'Update Your Payment Method - Card Expiring {{expiry_date}}',
  '<!DOCTYPE html><html><body style="font-family: Arial;"><div style="max-width: 600px; margin: 20px auto; padding: 20px;"><h2>Beautonomi</h2><p>Your subscription payment card is expiring soon.</p><p><strong>Expiry:</strong> {{expiry_date}}</p><p><strong>Card:</strong> {{description}}</p><p>Please update your payment method in your account settings to avoid any interruption to your subscription.</p><p><a href="{{app_url}}/provider/subscription">Update payment method</a></p><p>Sincerely,<br>The Beautonomi Team</p></div></body></html>',
  'Your subscription card ({{description}}) expires {{expiry_date}}. Update your payment method at {{app_url}}/provider/subscription.',
  ARRAY['push', 'email']::TEXT[],
  ARRAY['expiry_date', 'description', 'customer_email', 'app_url', 'year']::TEXT[],
  true,
  'Sent to provider when Paystack reports their subscription card is expiring this month (subscription.expiring_cards webhook).'
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body,
  channels = EXCLUDED.channels,
  variables = EXCLUDED.variables,
  enabled = EXCLUDED.enabled,
  description = EXCLUDED.description,
  updated_at = NOW();
