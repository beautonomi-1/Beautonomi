-- Ensure post-visit retention template exists (921 only UPDATEs existing keys).

INSERT INTO public.notification_templates (
  key,
  title,
  body,
  sms_body,
  whatsapp_body,
  channels,
  enabled,
  tenant_id,
  whatsapp_category,
  channel_waterfall
)
SELECT
  'post_visit_whatsapp',
  'Thanks for visiting',
  'Thanks for visiting {{provider_name}}. {{loyalty_points}} Leave a review: {{review_url}}',
  'Thanks for visiting {{provider_name}}. Tell us how it went: {{review_url}}',
  'Thanks for visiting {{provider_name}}. {{loyalty_points}} Tell us how it went: {{review_url}}',
  ARRAY['push', 'email', 'whatsapp']::text[],
  true,
  NULL,
  'utility',
  '["whatsapp","sms","email"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
  WHERE key = 'post_visit_whatsapp' AND tenant_id IS NULL
);
