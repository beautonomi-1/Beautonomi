-- Migration 910: Align agent brain defaults with AI Platform roster (default routing + vision).
-- Idempotent — safe if 909 already ran with older vision-only-on-moderator logic.

UPDATE public.agent_definitions d
SET
  preferred_model_id = NULL,
  fallback_model_id = NULL,
  max_cost_usd_per_run = 0.25,
  task_default = v.task_default,
  vision_enabled = v.vision_enabled
FROM (
  VALUES
    ('ops-sentinel', 'classification', true),
    ('support-triage', 'classification', true),
    ('support-lead', 'drafting', true),
    ('payout-review', 'classification', true),
    ('reconciliation-investigator', 'classification', true),
    ('refund-specialist', 'classification', true),
    ('provider-success', 'drafting', true),
    ('membership-shepherd', 'drafting', true),
    ('trust-monitor', 'classification', true),
    ('content-moderator', 'classification', true),
    ('admin-copilot', 'copilot', true)
) AS v(key, task_default, vision_enabled)
WHERE d.key = v.key;

UPDATE public.agent_operational_state aos
SET state = 'active', updated_at = NOW()
FROM public.agent_definitions d
WHERE aos.agent_id = d.id
  AND d.key IN (
    'ops-sentinel', 'support-triage', 'support-lead', 'payout-review',
    'reconciliation-investigator', 'refund-specialist', 'provider-success',
    'membership-shepherd', 'trust-monitor', 'content-moderator', 'admin-copilot'
  );
