-- Agentic workforce: module config, definitions, tool grants, runs, actions, approvals, evidence.

-- Module configuration (per environment, master OFF by default)
CREATE TABLE IF NOT EXISTS public.agent_module_config (
  environment TEXT PRIMARY KEY CHECK (environment IN ('production', 'staging', 'development')),
  master_enabled BOOLEAN NOT NULL DEFAULT false,
  shadow_mode BOOLEAN NOT NULL DEFAULT true,
  global_daily_spend_cap_usd NUMERIC(12, 4),
  default_routing_policy_id TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.agent_module_config (environment, master_enabled, shadow_mode)
VALUES ('production', false, true), ('staging', false, true), ('development', false, true)
ON CONFLICT (environment) DO NOTHING;

-- Agent definitions (identity + role mapping, no operational state)
CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  admin_role TEXT NOT NULL,
  allowed_workflow_types TEXT[] NOT NULL DEFAULT '{}',
  risk_ceiling SMALLINT NOT NULL DEFAULT 1 CHECK (risk_ceiling BETWEEN 0 AND 3),
  active_version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_definition_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version)
);

-- Tool grants
CREATE TABLE IF NOT EXISTS public.agent_tool_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_version TEXT NOT NULL DEFAULT '1',
  tenant_scope TEXT NOT NULL DEFAULT 'all',
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  risk_ceiling SMALLINT NOT NULL DEFAULT 1 CHECK (risk_ceiling BETWEEN 0 AND 3),
  max_rows INT NOT NULL DEFAULT 50,
  max_output_bytes INT NOT NULL DEFAULT 65536,
  rate_limit_per_min INT NOT NULL DEFAULT 60,
  daily_call_cap INT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tool_grants_unique
  ON public.agent_tool_grants(agent_id, tool_name, tool_version, tenant_scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Operational state (separate from definitions)
CREATE TABLE IF NOT EXISTS public.agent_operational_state (
  agent_id UUID PRIMARY KEY REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'disabled' CHECK (state IN ('active', 'paused', 'draining', 'disabled')),
  last_heartbeat_at TIMESTAMPTZ,
  concurrent_run_count INT NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emergency controls
CREATE TABLE IF NOT EXISTS public.agent_emergency_controls (
  environment TEXT PRIMARY KEY CHECK (environment IN ('production', 'staging', 'development')),
  stop_new_runs BOOLEAN NOT NULL DEFAULT false,
  stop_all_tool_calls BOOLEAN NOT NULL DEFAULT false,
  block_approved_execution BOOLEAN NOT NULL DEFAULT false,
  freeze_pending_proposals BOOLEAN NOT NULL DEFAULT false,
  allow_readonly_completion BOOLEAN NOT NULL DEFAULT true,
  activated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  reason TEXT
);

INSERT INTO public.agent_emergency_controls (environment)
VALUES ('production'), ('staging'), ('development')
ON CONFLICT (environment) DO NOTHING;

-- Runtime observability
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  agent_id UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE RESTRICT,
  agent_version TEXT NOT NULL,
  workflow_type TEXT NOT NULL,
  workflow_run_id TEXT,
  trigger_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  shadow_mode BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_tokens_in INT NOT NULL DEFAULT 0,
  total_tokens_out INT NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  escalation_count INT NOT NULL DEFAULT 0,
  error_class TEXT,
  correlation_id TEXT,
  sentry_trace TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_agent ON public.agent_runs(tenant_id, agent_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('model', 'tool', 'policy')),
  tool_name TEXT,
  tool_version TEXT,
  model_provider TEXT,
  model_id TEXT,
  prompt_version TEXT,
  input_ref TEXT,
  output_ref TEXT,
  retention_class TEXT NOT NULL DEFAULT 'A' CHECK (retention_class IN ('A', 'B', 'C', 'D')),
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  latency_ms INT,
  schema_valid BOOLEAN,
  policy_denied BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run_seq ON public.agent_steps(run_id, seq);

-- Authoritative approval record
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE RESTRICT,
  workflow_run_id TEXT,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash TEXT NOT NULL,
  proposal_version INT NOT NULL DEFAULT 1,
  reasoning_summary TEXT,
  risk_level SMALLINT NOT NULL DEFAULT 2 CHECK (risk_level BETWEEN 0 AND 3),
  policy_version TEXT NOT NULL,
  tool_name TEXT,
  tool_version TEXT,
  prompt_version TEXT,
  model_provider TEXT,
  model_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'proposed', 'approval_pending', 'approved', 'rejected', 'expired',
    'cancelled', 'frozen', 'revoked', 'superseded', 'executing', 'executed',
    'retryable_failure', 'permanent_failure', 'manual_intervention'
  )),
  proposed_at TIMESTAMPTZ,
  approval_expires_at TIMESTAMPTZ,
  approved_payload_hash TEXT,
  approved_at TIMESTAMPTZ,
  executing_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  execution_attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  failure_class TEXT,
  retryable BOOLEAN,
  next_retry_at TIMESTAMPTZ,
  last_execution_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  lease_owner TEXT,
  lease_acquired_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  frozen_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  frozen_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  supersedes_action_id UUID REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_tenant_status ON public.agent_actions(tenant_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_actions_open_per_target
  ON public.agent_actions(tenant_id, action_type, target_type, target_id)
  WHERE status IN ('proposed', 'approval_pending', 'approved', 'executing');

CREATE TABLE IF NOT EXISTS public.agent_action_approval_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES public.agent_actions(id) ON DELETE CASCADE,
  stage INT NOT NULL,
  required_role TEXT NOT NULL,
  required_count INT NOT NULL DEFAULT 1,
  must_be_distinct_from_stage INT,
  require_current_authority_at_execution BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  UNIQUE (action_id, stage)
);

CREATE TABLE IF NOT EXISTS public.agent_action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id UUID NOT NULL REFERENCES public.agent_action_approval_requirements(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewer_role_snapshot TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  payload_hash TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comments TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_action_approvals_requirement ON public.agent_action_approvals(requirement_id);

-- One decision per reviewer per requirement (maker-checker distinctness enforced in service layer too)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_action_approvals_unique_reviewer
  ON public.agent_action_approvals(requirement_id, reviewer_id);

CREATE TABLE IF NOT EXISTS public.agent_action_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES public.agent_actions(id) ON DELETE CASCADE,
  source_tool_call_id TEXT,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_version TEXT,
  field_names TEXT[] NOT NULL DEFAULT '{}',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redacted_snapshot_hash TEXT
);

CREATE TABLE IF NOT EXISTS public.agent_eval_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite TEXT NOT NULL,
  case_id TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  prompt_version TEXT,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  git_sha TEXT
);

-- Seed default agent definitions (disabled until enabled in console)
INSERT INTO public.agent_definitions (key, display_name, admin_role, allowed_workflow_types, risk_ceiling, active_version)
VALUES
  ('ops-sentinel', 'Ops Sentinel', 'admin_operations', ARRAY['ops-sentinel'], 0, '1.0.0'),
  ('support-triage', 'Support Triage', 'admin_support', ARRAY['support-triage', 'support-classification'], 1, '1.0.0'),
  ('payout-review', 'Payout Review', 'admin_finance', ARRAY['payout-review'], 2, '1.0.0'),
  ('reconciliation-investigator', 'Reconciliation Investigator', 'admin_finance', ARRAY['reconciliation-investigation'], 2, '1.0.0'),
  ('trust-monitor', 'Trust Monitor', 'admin_trust', ARRAY['fraud-briefing'], 3, '1.0.0'),
  ('admin-copilot', 'Admin Copilot', 'admin_support', ARRAY['admin-copilot'], 0, '1.0.0')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.agent_operational_state (agent_id, state)
SELECT id, 'disabled' FROM public.agent_definitions
ON CONFLICT (agent_id) DO NOTHING;

-- Seed read-only tool grants (least privilege; any mutation tool requires an explicit new grant)
INSERT INTO public.agent_tool_grants (agent_id, tool_name, tool_version, risk_ceiling, max_rows, max_output_bytes, rate_limit_per_min)
SELECT d.id, g.tool_name, '1', g.risk_ceiling, g.max_rows, g.max_output_bytes, g.rate_limit
FROM public.agent_definitions d
JOIN (VALUES
  ('ops-sentinel', 'ops.readSystemHealth', 0, 20, 16384, 30),
  ('support-triage', 'support.readTicket', 1, 1, 8192, 120),
  ('support-triage', 'support.classifyTicket', 1, 1, 4096, 60),
  ('payout-review', 'finance.readPayout', 2, 1, 4096, 60),
  ('trust-monitor', 'trust.readFraudCase', 3, 1, 8192, 30),
  ('admin-copilot', 'ops.readSystemHealth', 0, 20, 16384, 30),
  ('admin-copilot', 'support.readTicket', 0, 1, 8192, 120),
  ('admin-copilot', 'finance.readPayout', 2, 1, 4096, 60),
  ('admin-copilot', 'trust.readFraudCase', 3, 1, 8192, 30)
) AS g(agent_key, tool_name, risk_ceiling, max_rows, max_output_bytes, rate_limit)
  ON d.key = g.agent_key
ON CONFLICT DO NOTHING;

ALTER TABLE public.agent_module_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_operational_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_emergency_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_approval_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_evidence ENABLE ROW LEVEL SECURITY;

-- Superadmin + platform_config access (service role used by app for agent runtime writes)
CREATE POLICY agent_module_config_superadmin ON public.agent_module_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

CREATE POLICY agent_actions_tenant_read ON public.agent_actions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.tenant_id = agent_actions.tenant_id AND utr.is_active
    )
  );
