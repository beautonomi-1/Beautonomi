-- ============================================================================
-- Migration 192: Add Subscription Notification Templates
-- ============================================================================
-- This migration adds notification templates for subscription changes:
-- upgrade, downgrade, cancel, and renewal
-- ============================================================================

-- Insert 'subscription_upgraded' template
INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_upgraded',
  'Your Subscription Has Been Upgraded',
  'Your subscription has been upgraded to {{plan_name}}. Your new billing amount is {{new_amount}}/{{billing_period}}. Thank you for upgrading!',
  'Subscription Upgraded - {{plan_name}}',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Upgraded</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .header { background-color: #f4f4f4; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
        .content { padding: 20px 0; }
        .footer { text-align: center; font-size: 0.8em; color: #777; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
        .button { display: inline-block; background-color: #FF0077; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .highlight { background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Beautonomi</h2>
        </div>
        <div class="content">
            <p>Dear {{business_name}},</p>
            <p>Great news! Your subscription has been successfully upgraded.</p>
            <div class="highlight">
                <p><strong>New Plan:</strong> {{plan_name}}</p>
                <p><strong>Billing Amount:</strong> {{new_amount}}/{{billing_period}}</p>
                <p><strong>Previous Plan:</strong> {{old_plan_name}}</p>
            </div>
            <p>Your upgraded subscription is now active and you have access to all the features included in your new plan.</p>
            <p>Your next billing date is {{next_payment_date}}.</p>
            <p style="text-align: center; margin-top: 30px;">
                <a href="{{app_url}}/provider/dashboard" class="button">View Dashboard</a>
            </p>
            <p>Thank you for choosing Beautonomi!</p>
            <p>Sincerely,<br>The Beautonomi Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{year}} Beautonomi. All rights reserved.</p>
        </div>
    </div>
</body>
</html>',
  'Your Beautonomi subscription has been upgraded to {{plan_name}}. New amount: {{new_amount}}/{{billing_period}}.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name', 'plan_name', 'old_plan_name', 'new_amount', 'billing_period', 'next_payment_date', 'app_url', 'year'],
  TRUE,
  'Notification sent to a provider when their subscription is upgraded to a higher plan.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_upgraded');

-- Insert 'subscription_downgraded' template
INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_downgraded',
  'Your Subscription Has Been Downgraded',
  'Your subscription has been changed to {{plan_name}}. Your new billing amount is {{new_amount}}/{{billing_period}}. The changes will take effect on {{effective_date}}.',
  'Subscription Changed - {{plan_name}}',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Changed</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .header { background-color: #f4f4f4; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
        .content { padding: 20px 0; }
        .footer { text-align: center; font-size: 0.8em; color: #777; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
        .button { display: inline-block; background-color: #FF0077; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .highlight { background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Beautonomi</h2>
        </div>
        <div class="content">
            <p>Dear {{business_name}},</p>
            <p>Your subscription plan has been changed.</p>
            <div class="highlight">
                <p><strong>New Plan:</strong> {{plan_name}}</p>
                <p><strong>Billing Amount:</strong> {{new_amount}}/{{billing_period}}</p>
                <p><strong>Previous Plan:</strong> {{old_plan_name}}</p>
                <p><strong>Effective Date:</strong> {{effective_date}}</p>
            </div>
            <p>Your subscription will continue with the new plan features and pricing. If you have any questions about this change, please contact our support team.</p>
            <p style="text-align: center; margin-top: 30px;">
                <a href="{{app_url}}/provider/dashboard" class="button">View Dashboard</a>
            </p>
            <p>Thank you for being a valued Beautonomi provider!</p>
            <p>Sincerely,<br>The Beautonomi Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{year}} Beautonomi. All rights reserved.</p>
        </div>
    </div>
</body>
</html>',
  'Your Beautonomi subscription has been changed to {{plan_name}}. New amount: {{new_amount}}/{{billing_period}}. Effective: {{effective_date}}.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name', 'plan_name', 'old_plan_name', 'new_amount', 'billing_period', 'effective_date', 'app_url', 'year'],
  TRUE,
  'Notification sent to a provider when their subscription is downgraded or changed to a lower plan.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_downgraded');

-- Insert 'subscription_cancelled' template
INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_cancelled',
  'Your Subscription Has Been Cancelled',
  'Your subscription has been cancelled. Your access will continue until {{expires_at}}. You can reactivate your subscription anytime before then.',
  'Subscription Cancelled - Access Until {{expires_at}}',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Cancelled</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .header { background-color: #f4f4f4; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
        .content { padding: 20px 0; }
        .footer { text-align: center; font-size: 0.8em; color: #777; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
        .button { display: inline-block; background-color: #FF0077; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .highlight { background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Beautonomi</h2>
        </div>
        <div class="content">
            <p>Dear {{business_name}},</p>
            <p>We have received your request to cancel your subscription.</p>
            <div class="highlight">
                <p><strong>Cancelled Plan:</strong> {{plan_name}}</p>
                <p><strong>Access Until:</strong> {{expires_at}}</p>
            </div>
            <p>Your subscription has been cancelled and will not renew automatically. Your access to Beautonomi features will continue until {{expires_at}}.</p>
            <p>If you change your mind, you can reactivate your subscription anytime before {{expires_at}} by visiting your dashboard.</p>
            <p style="text-align: center; margin-top: 30px;">
                <a href="{{app_url}}/provider/dashboard" class="button">Reactivate Subscription</a>
            </p>
            <p>We''re sorry to see you go. If there''s anything we can do to help, please don''t hesitate to contact our support team.</p>
            <p>Sincerely,<br>The Beautonomi Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{year}} Beautonomi. All rights reserved.</p>
        </div>
    </div>
</body>
</html>',
  'Your Beautonomi subscription has been cancelled. Access continues until {{expires_at}}. You can reactivate anytime.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name', 'plan_name', 'expires_at', 'app_url', 'year'],
  TRUE,
  'Notification sent to a provider when their subscription is cancelled.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_cancelled');

-- Insert 'subscription_renewed' template (for automatic renewals)
INSERT INTO public.notification_templates (key, title, body, email_subject, email_body, sms_body, channels, variables, enabled, description)
SELECT
  'subscription_renewed',
  'Your Subscription Has Been Renewed',
  'Your subscription has been automatically renewed. Your next billing date is {{next_payment_date}}.',
  'Subscription Renewed - Next Payment: {{next_payment_date}}',
  '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Renewed</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .header { background-color: #f4f4f4; padding: 10px; text-align: center; border-bottom: 1px solid #ddd; }
        .content { padding: 20px 0; }
        .footer { text-align: center; font-size: 0.8em; color: #777; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
        .button { display: inline-block; background-color: #FF0077; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .highlight { background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Beautonomi</h2>
        </div>
        <div class="content">
            <p>Dear {{business_name}},</p>
            <p>Your subscription has been successfully renewed.</p>
            <div class="highlight">
                <p><strong>Current Plan:</strong> {{plan_name}}</p>
                <p><strong>Billing Amount:</strong> {{amount}}/{{billing_period}}</p>
                <p><strong>Next Payment Date:</strong> {{next_payment_date}}</p>
            </div>
            <p>Your subscription will continue to renew automatically. You can manage your subscription settings anytime from your dashboard.</p>
            <p style="text-align: center; margin-top: 30px;">
                <a href="{{app_url}}/provider/dashboard" class="button">View Dashboard</a>
            </p>
            <p>Thank you for being a valued Beautonomi provider!</p>
            <p>Sincerely,<br>The Beautonomi Team</p>
        </div>
        <div class="footer">
            <p>&copy; {{year}} Beautonomi. All rights reserved.</p>
        </div>
    </div>
</body>
</html>',
  'Your Beautonomi subscription has been renewed. Next payment: {{next_payment_date}}.',
  ARRAY['push', 'email', 'sms'],
  ARRAY['business_name', 'plan_name', 'amount', 'billing_period', 'next_payment_date', 'app_url', 'year'],
  TRUE,
  'Notification sent to a provider when their subscription is automatically renewed.'
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE key = 'subscription_renewed');
