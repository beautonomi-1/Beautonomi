-- ============================================================================
-- Migration 191: Add Provider Status Notification Templates
-- ============================================================================
-- This migration adds notification templates for provider suspension and
-- reactivation, allowing superadmin to customize notification messages.
-- ============================================================================

-- Insert provider suspended notification template
INSERT INTO notification_templates (
  key,
  title,
  body,
  email_subject,
  email_body,
  sms_body,
  channels,
  variables,
  url,
  enabled,
  description
) VALUES (
  'provider_suspended',
  'Provider Account Suspended',
  'Your provider account "{{business_name}}" has been suspended. {{reason}} Please contact support if you have any questions.',
  'Your Provider Account Has Been Suspended',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #dc3545; margin-top: 0;">Account Suspended</h1>
    <p>Dear Provider,</p>
    <p>We are writing to inform you that your provider account <strong>"{{business_name}}"</strong> has been suspended.</p>
    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0;">
      <strong>Reason:</strong> {{reason}}
    </div>
    <p>During this suspension period, your account will not be visible to customers and you will not be able to receive new bookings.</p>
    <p>If you have any questions or would like to discuss this matter further, please contact our support team.</p>
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
      <p style="margin: 0;">Best regards,<br>The Beautonomi Team</p>
    </div>
  </div>
</body>
</html>',
  'Your provider account "{{business_name}}" has been suspended. {{reason}} Contact support for assistance.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name', 'reason'],
  '/provider/dashboard',
  true,
  'Notification sent when a provider account is suspended by superadmin'
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body,
  channels = EXCLUDED.channels,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Insert provider reactivated notification template
INSERT INTO notification_templates (
  key,
  title,
  body,
  email_subject,
  email_body,
  sms_body,
  channels,
  variables,
  url,
  enabled,
  description
) VALUES (
  'provider_reactivated',
  'Provider Account Reactivated',
  'Great news! Your provider account "{{business_name}}" has been reactivated and is now active. You can start receiving bookings again.',
  'Your Provider Account Has Been Reactivated',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #28a745; margin-top: 0;">Account Reactivated</h1>
    <p>Dear Provider,</p>
    <p>We are pleased to inform you that your provider account <strong>"{{business_name}}"</strong> has been reactivated and is now active.</p>
    <p>You can now:</p>
    <ul style="padding-left: 20px;">
      <li>Receive new bookings from customers</li>
      <li>Manage your services and availability</li>
      <li>Access all provider features</li>
    </ul>
    <p>Thank you for your patience. We look forward to continuing to work with you.</p>
    <div style="margin-top: 30px; text-align: center;">
      <a href="{{url}}" style="background-color: #FF0077; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
    </div>
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
      <p style="margin: 0;">Best regards,<br>The Beautonomi Team</p>
    </div>
  </div>
</body>
</html>',
  'Great news! Your provider account "{{business_name}}" has been reactivated. You can start receiving bookings again.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name'],
  '/provider/dashboard',
  true,
  'Notification sent when a provider account is reactivated by superadmin'
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  sms_body = EXCLUDED.sms_body,
  channels = EXCLUDED.channels,
  variables = EXCLUDED.variables,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Insert provider approved notification template (if not exists)
INSERT INTO notification_templates (
  key,
  title,
  body,
  email_subject,
  email_body,
  sms_body,
  channels,
  variables,
  url,
  enabled,
  description
) VALUES (
  'provider_approved',
  'Provider Account Approved',
  'Congratulations! Your provider account "{{business_name}}" has been approved and is now active. You can start receiving bookings.',
  'Your Provider Account Has Been Approved',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #28a745; margin-top: 0;">Account Approved</h1>
    <p>Dear Provider,</p>
    <p>Congratulations! Your provider account <strong>"{{business_name}}"</strong> has been approved and is now active.</p>
    <p>You can now:</p>
    <ul style="padding-left: 20px;">
      <li>Receive bookings from customers</li>
      <li>Manage your services and availability</li>
      <li>Access all provider features</li>
    </ul>
    <div style="margin-top: 30px; text-align: center;">
      <a href="{{url}}" style="background-color: #FF0077; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
    </div>
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
      <p style="margin: 0;">Best regards,<br>The Beautonomi Team</p>
    </div>
  </div>
</body>
</html>',
  'Congratulations! Your provider account "{{business_name}}" has been approved and is now active.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name'],
  '/provider/dashboard',
  true,
  'Notification sent when a provider account is approved by superadmin'
)
ON CONFLICT (key) DO NOTHING;
