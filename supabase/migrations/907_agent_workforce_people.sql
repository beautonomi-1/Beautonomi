-- Migration 907: Split workforce identities; retarget workflows without new cron slots.

INSERT INTO public.agent_definitions (
  key, display_name, admin_role, allowed_workflow_types, risk_ceiling, active_version,
  task_default, vision_enabled
)
VALUES
  (
    'support-lead',
    'Support Lead',
    'admin_support',
    ARRAY['support-followups', 'support-lead'],
    1,
    '1.0.0',
    'drafting',
    false
  ),
  (
    'refund-specialist',
    'Refund Specialist',
    'admin_finance',
    ARRAY['refund-preprocessor', 'refund-briefing'],
    2,
    '1.0.0',
    'classification',
    false
  ),
  (
    'provider-success',
    'Provider Success',
    'admin_operations',
    ARRAY['provider-ops', 'provider-outreach'],
    1,
    '1.0.0',
    'drafting',
    false
  ),
  (
    'membership-shepherd',
    'Membership Shepherd',
    'admin_operations',
    ARRAY['membership-dunning'],
    1,
    '1.0.0',
    'drafting',
    false
  ),
  (
    'content-moderator',
    'Content Moderator',
    'admin_trust',
    ARRAY['content-moderation', 'moderation-suggest'],
    2,
    '1.0.0',
    'classification',
    true
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.agent_operational_state (agent_id, state)
SELECT id, 'disabled' FROM public.agent_definitions d
WHERE d.key IN ('support-lead', 'refund-specialist', 'provider-success', 'membership-shepherd', 'content-moderator')
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO public.agent_tool_grants (
  agent_id, tool_name, tool_version, risk_ceiling, max_rows, max_output_bytes, rate_limit_per_min
)
SELECT d.id, g.tool_name, '1', g.risk_ceiling, g.max_rows, g.max_output_bytes, g.rate_limit
FROM public.agent_definitions d
JOIN (VALUES
  ('support-lead', 'support.readTicket', 1, 1, 8192, 120),
  ('support-lead', 'support.classifyTicket', 1, 1, 4096, 60),
  ('refund-specialist', 'finance.readRefund', 2, 1, 4096, 60),
  ('provider-success', 'provider.readHealthSnapshot', 1, 1, 8192, 60),
  ('membership-shepherd', 'finance.readRefund', 1, 1, 4096, 30),
  ('content-moderator', 'safety.readContentReport', 2, 20, 16384, 30)
) AS g(agent_key, tool_name, risk_ceiling, max_rows, max_output_bytes, rate_limit)
  ON d.key = g.agent_key
ON CONFLICT DO NOTHING;
