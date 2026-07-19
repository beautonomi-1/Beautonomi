-- Migration 806: Agent workforce notification templates
--
-- Delivery rail for human-approved agent outreach:
--   * agent_provider_outreach — health check-ins, onboarding nudges, and
--     catalog improvement tips proposed by agents and approved by admins.
--   * agent_provider_digest   — the weekly "your week at a glance" summary.
--
-- Both are only ever sent by the agent-action executor AFTER human approval
-- in the Agentic Console (mirrors template pattern from 755).

INSERT INTO public.notification_templates (key, title, body, channels, email_subject, email_body, variables, enabled, description)
SELECT key, title, body, channels, email_subject, email_body, variables, true, description
FROM (
  VALUES
    (
      'agent_provider_outreach',
      '{{subject}}',
      '{{message}}',
      ARRAY['push', 'email'],
      '{{subject}}',
      '<p style="white-space:pre-line;">{{message}}</p><p style="color:#6b7280;font-size:12px;">Sent by the Beautonomi team.</p>',
      ARRAY['subject', 'message'],
      'Human-approved agent outreach to a provider (health check-in, onboarding nudge, listing tips).'
    ),
    (
      'agent_provider_digest',
      'Your week at Beautonomi ({{week}})',
      'This week: {{bookings}} bookings ({{completed}} completed, {{cancelled}} cancelled), {{revenue}} earned, {{new_reviews}} new review(s). Tip: {{suggestion}}',
      ARRAY['push', 'email'],
      'Your week at Beautonomi — {{week}}',
      '<h2 style="margin:0 0 12px;">Your week at a glance</h2><ul style="line-height:1.7;"><li><strong>{{bookings}}</strong> bookings ({{completed}} completed, {{cancelled}} cancelled)</li><li><strong>{{revenue}}</strong> earned from completed bookings</li><li><strong>{{new_reviews}}</strong> new review(s)</li></ul><p style="margin:16px 0 0;padding:12px 14px;border-radius:12px;background:#f8fafc;border:1px solid #e5e7eb;"><strong>Tip of the week:</strong> {{suggestion}}</p>',
      ARRAY['week', 'bookings', 'completed', 'cancelled', 'revenue', 'new_reviews', 'suggestion'],
      'Weekly provider business digest proposed by the ops agent and approved by an admin.'
    )
) AS t(key, title, body, channels, email_subject, email_body, variables, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates nt WHERE nt.key = t.key
);
