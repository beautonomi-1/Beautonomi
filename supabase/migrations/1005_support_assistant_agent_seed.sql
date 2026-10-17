-- Seed support-assistant agent (customer/provider ticket-thread bot). Disabled until ops enables.

INSERT INTO public.agent_definitions (
  key, display_name, admin_role, allowed_workflow_types, risk_ceiling, active_version,
  task_default, vision_enabled, max_cost_usd_per_run
)
VALUES (
  'support-assistant',
  'Support Assistant',
  'admin_support',
  ARRAY['support-assistant'],
  1,
  '1.0.0',
  'drafting',
  false,
  0.25
)
ON CONFLICT (key) DO UPDATE
SET
  task_default = EXCLUDED.task_default,
  vision_enabled = EXCLUDED.vision_enabled,
  max_cost_usd_per_run = EXCLUDED.max_cost_usd_per_run;

INSERT INTO public.agent_operational_state (agent_id, state)
SELECT id, 'disabled' FROM public.agent_definitions WHERE key = 'support-assistant'
ON CONFLICT (agent_id) DO UPDATE SET state = 'disabled', updated_at = NOW();
