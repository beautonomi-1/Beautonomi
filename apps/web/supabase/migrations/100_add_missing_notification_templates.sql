-- Beautonomi Database Migration
-- 100_add_missing_notification_templates.sql
-- Adds missing notification templates for booking cancellations and reschedules

-- Add provider_booking_cancelled template (for provider when customer cancels)
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
  'provider_booking_cancelled',
  'Booking Cancelled by Customer',
  '{{customer_name}} has cancelled their booking on {{booking_date}} at {{booking_time}}. Services: {{services}}',
  ARRAY['push', 'email']::TEXT[],
  'Booking Cancelled - {{customer_name}}',
  '<h2>Booking Cancelled</h2><p>A customer has cancelled their booking.</p><p><strong>Customer:</strong> {{customer_name}}</p><p><strong>Date:</strong> {{booking_date}}</p><p><strong>Time:</strong> {{booking_time}}</p><p><strong>Services:</strong> {{services}}</p><p>Booking ID: {{booking_id}}</p>',
  NULL,
  ARRAY['customer_name', 'booking_date', 'booking_time', 'services', 'booking_id']::TEXT[],
  '/provider/bookings/{{booking_id}}',
  true,
  'Sent to provider when a customer cancels their booking'
) ON CONFLICT (key) DO UPDATE SET
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

-- Add provider_booking_rescheduled template (for provider when customer reschedules)
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
  'provider_booking_rescheduled',
  'Booking Rescheduled by Customer',
  '{{customer_name}} has rescheduled their booking from {{old_date}} at {{old_time}} to {{new_date}} at {{new_time}}',
  ARRAY['push', 'email']::TEXT[],
  'Booking Rescheduled - {{customer_name}}',
  '<h2>Booking Rescheduled</h2><p>A customer has rescheduled their booking.</p><p><strong>Customer:</strong> {{customer_name}}</p><p><strong>New Date:</strong> {{new_date}}</p><p><strong>New Time:</strong> {{new_time}}</p><p><strong>Previous:</strong> {{old_date}} at {{old_time}}</p><p>Booking ID: {{booking_id}}</p>',
  NULL,
  ARRAY['customer_name', 'new_date', 'new_time', 'old_date', 'old_time', 'booking_id']::TEXT[],
  '/provider/bookings/{{booking_id}}',
  true,
  'Sent to provider when a customer reschedules their booking'
) ON CONFLICT (key) DO UPDATE SET
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

-- Verify booking_cancelled template has booking_id variable (add if missing)
UPDATE public.notification_templates
SET 
  variables = CASE 
    WHEN 'booking_id' = ANY(variables) THEN variables
    ELSE array_append(variables, 'booking_id')
  END,
  url = COALESCE(NULLIF(url, ''), '/bookings/{{booking_id}}')
WHERE key = 'booking_cancelled'
  AND ('booking_id' != ALL(variables) OR url IS NULL OR url = '');

-- Verify booking_cancelled_by_customer template has booking_id variable
UPDATE public.notification_templates
SET 
  variables = CASE 
    WHEN 'booking_id' = ANY(variables) THEN variables
    ELSE array_append(variables, 'booking_id')
  END,
  url = COALESCE(NULLIF(url, ''), '/bookings/{{booking_id}}')
WHERE key = 'booking_cancelled_by_customer'
  AND ('booking_id' != ALL(variables) OR url IS NULL OR url = '');

-- Verify booking_cancelled_by_provider template has booking_id variable
UPDATE public.notification_templates
SET 
  variables = CASE 
    WHEN 'booking_id' = ANY(variables) THEN variables
    ELSE array_append(variables, 'booking_id')
  END,
  url = COALESCE(NULLIF(url, ''), '/bookings/{{booking_id}}')
WHERE key = 'booking_cancelled_by_provider'
  AND ('booking_id' != ALL(variables) OR url IS NULL OR url = '');

-- Verify booking_rescheduled template has booking_id variable
UPDATE public.notification_templates
SET 
  variables = CASE 
    WHEN 'booking_id' = ANY(variables) THEN variables
    ELSE array_append(variables, 'booking_id')
  END,
  url = COALESCE(NULLIF(url, ''), '/bookings/{{booking_id}}')
WHERE key = 'booking_rescheduled'
  AND ('booking_id' != ALL(variables) OR url IS NULL OR url = '');

-- Verify booking_confirmed template has booking_id variable
UPDATE public.notification_templates
SET 
  variables = CASE 
    WHEN 'booking_id' = ANY(variables) THEN variables
    ELSE array_append(variables, 'booking_id')
  END,
  url = COALESCE(NULLIF(url, ''), '/bookings/{{booking_id}}')
WHERE key = 'booking_confirmed'
  AND ('booking_id' != ALL(variables) OR url IS NULL OR url = '');
