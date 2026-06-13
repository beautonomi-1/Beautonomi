-- Guest booking portal link + account claim invite templates + feature flag
--
-- NOTE: Migration 354 dropped the global UNIQUE constraint on
-- notification_templates(key) in favour of partial unique indexes
-- (WHERE tenant_id IS NULL / WHERE tenant_id IS NOT NULL), so a plain
-- ON CONFLICT (key) raises 42P10. Same applies to feature_flags(feature_key)
-- after migration 348. Use insert-if-absent (pattern from 611/612) instead.

-- ── guest_booking_link ───────────────────────────────────────────────────────
INSERT INTO public.notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
SELECT
  'guest_booking_link',
  'Your appointment – {{booking_number}}',
  'View your booking details and verification codes: {{portal_url}}',
  ARRAY['email', 'sms']::TEXT[],
  'Your appointment with {{provider_name}} – {{booking_number}}',
  '<h2>Your appointment is confirmed</h2><p>Hi {{customer_name}},</p><p><strong>{{provider_name}}</strong> has booked an appointment for you on <strong>{{scheduled_at}}</strong>.</p><p><a href="{{portal_url}}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">View booking</a></p><p style="color:#6B7280;font-size:13px;">Use this link to view your booking, see arrival verification codes, reschedule, or cancel. No app required.</p>',
  ARRAY['portal_url', 'booking_number', 'booking_id', 'provider_name', 'customer_name', 'scheduled_at']::TEXT[],
  '{{portal_url}}',
  'Sent to shadow/guest customers when a provider creates a booking. Variables: {{portal_url}} (signed guest portal link), {{claim_url}} optional.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = 'guest_booking_link' AND nt.tenant_id IS NULL
);

-- ── account_claim_invite ─────────────────────────────────────────────────────
INSERT INTO public.notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
SELECT
  'account_claim_invite',
  'Claim your Beautonomi account',
  'We found bookings under this email. Set your password to claim your account: {{claim_url}}',
  ARRAY['email']::TEXT[],
  'Claim your Beautonomi account',
  '<h2>We found your bookings</h2><p>Hi {{customer_name}},</p><p>An appointment was booked for you on Beautonomi. Click below to set a password and access your bookings, wallet, and history.</p><p><a href="{{claim_url}}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">Claim my account</a></p><p style="color:#6B7280;font-size:13px;">If you did not expect this email, you can ignore it.</p>',
  ARRAY['claim_url', 'customer_name', 'customer_email']::TEXT[],
  '{{claim_url}}',
  'Sent when a customer signs up with an email tied to a shadow account. Variables: {{claim_url}} (password recovery link).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = 'account_claim_invite' AND nt.tenant_id IS NULL
);

-- ── guest_arrival_verification ───────────────────────────────────────────────
INSERT INTO public.notification_templates (key, title, body, channels, email_subject, email_body, variables, url, description)
SELECT
  'guest_arrival_verification',
  'Provider arrived – view your code',
  '{{provider_name}} has arrived. View your verification code: {{portal_url}}',
  ARRAY['email', 'sms']::TEXT[],
  '{{provider_name}} has arrived – view your verification code',
  '<h2>Your provider has arrived</h2><p><strong>{{provider_name}}</strong> has arrived for booking <strong>{{booking_number}}</strong>.</p><p><a href="{{portal_url}}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">View verification code</a></p>',
  ARRAY['portal_url', 'booking_number', 'provider_name']::TEXT[],
  '{{portal_url}}',
  'Sent to shadow/guest customers when provider marks arrival (push unavailable). Variables: {{portal_url}}.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = 'guest_arrival_verification' AND nt.tenant_id IS NULL
);

-- ── feature flag ─────────────────────────────────────────────────────────────
INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
  'guest_booking_portal',
  'Guest booking portal links',
  'Auto-send signed portal links to shadow/guest customers when providers create bookings (email + SMS).',
  true,
  'notifications'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags
  WHERE feature_key = 'guest_booking_portal' AND tenant_id IS NULL
);
