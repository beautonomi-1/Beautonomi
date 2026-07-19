-- Generic account review notifications (no "fraud" wording in user-facing copy).

INSERT INTO public.notification_templates (
  key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description
)
SELECT
  'account_under_review',
  'Account under review',
  'We''re reviewing recent activity on your account. Some features may be temporarily limited. Contact support if you need help.',
  'Your Beautonomi account is under review',
  '<p>Hi {{user_name}},</p><p>We''re reviewing recent payment or account activity. Some features may be temporarily limited while we complete our review.</p><p>If you need help, reply to this email or visit Help in the app.</p><p>— The Beautonomi team</p>',
  'Beautonomi: your account is under review. Some features may be limited. Contact support if you need help.',
  ARRAY['email', 'push', 'sms']::TEXT[],
  ARRAY['user_name'],
  true,
  'Sent when Trust places a fraud case on hold (human action only).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'account_under_review');

INSERT INTO public.notification_templates (
  key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description
)
SELECT
  'account_review_cleared',
  'Account review complete',
  'Your account review is complete. Normal access has been restored.',
  'Your Beautonomi account review is complete',
  '<p>Hi {{user_name}},</p><p>Your account review is complete and normal access has been restored.</p><p>Thank you for your patience.</p><p>— The Beautonomi team</p>',
  'Beautonomi: your account review is complete. Normal access restored.',
  ARRAY['email', 'push', 'sms']::TEXT[],
  ARRAY['user_name'],
  true,
  'Sent when Trust releases or closes a fraud case after review (human action only).'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'account_review_cleared');
