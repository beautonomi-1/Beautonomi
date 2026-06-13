-- Identity verification outcome notifications (approve / reject + resubmit CTA)
--
-- NOTE: Migration 354 dropped the global UNIQUE constraint on
-- notification_templates(key) in favour of partial unique indexes
-- (WHERE tenant_id IS NULL / WHERE tenant_id IS NOT NULL), so use
-- insert-if-absent (pattern from 680/612) instead of ON CONFLICT (key).

-- ── identity_verification_approved ─────────────────────────────────────────────
INSERT INTO public.notification_templates (
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
SELECT
  'identity_verification_approved',
  'Identity verified',
  'Your identity has been verified. You''re all set.',
  ARRAY['push', 'email']::TEXT[],
  'Your identity has been verified',
  '<h2>Identity verified</h2>'
    || '<p>Your identity verification was approved.</p>'
    || '<p><a href="{{verification_url}}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">View verification status</a></p>',
  ARRAY['verification_url']::TEXT[],
  '{{verification_url}}',
  true,
  'Sent when admin or Sumsub approves a user''s identity verification.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = 'identity_verification_approved' AND nt.tenant_id IS NULL
);

-- ── identity_verification_rejected ─────────────────────────────────────────────
INSERT INTO public.notification_templates (
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
SELECT
  'identity_verification_rejected',
  'Identity verification needs attention',
  'We couldn''t verify your identity: {{rejection_reason}}. Please resubmit a clear photo of your document.',
  ARRAY['push', 'email']::TEXT[],
  'Please resubmit your identity verification',
  '<h2>Identity verification not approved</h2>'
    || '<p>We couldn''t verify your identity.</p>'
    || '<p><strong>Reason:</strong> {{rejection_reason}}</p>'
    || '<p>Please upload a new, clear photo of your ID document.</p>'
    || '<p><a href="{{verification_url}}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">Resubmit documents</a></p>',
  ARRAY['rejection_reason', 'verification_url']::TEXT[],
  '{{verification_url}}',
  true,
  'Sent when admin or Sumsub rejects identity verification. Variables: {{rejection_reason}}, {{verification_url}}.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt
  WHERE nt.key = 'identity_verification_rejected' AND nt.tenant_id IS NULL
);

UPDATE public.notification_templates
SET enabled = true, updated_at = NOW()
WHERE key IN ('identity_verification_approved', 'identity_verification_rejected')
  AND enabled IS DISTINCT FROM true;

-- Ensure the notification_type enum carries the new values so in-app bell
-- rows preserve the real type instead of falling back to "system".
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'identity_verification_approved';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'identity_verification_rejected';
