-- Vercel Workflow run registry (Part N). Links domain entities to durable run traces.

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL UNIQUE,
  workflow text NOT NULL,
  domain_type text,
  domain_id text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text,
  metadata jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_runs_active_domain
  ON public.workflow_runs (workflow, domain_id)
  WHERE status = 'running' AND domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started
  ON public.workflow_runs (workflow, started_at DESC);

COMMENT ON TABLE public.workflow_runs IS
  'Registry of Vercel Workflow runs; admin and cron_runs/agent_runs deep-link via run_id.';

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workflow_runs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.workflow_runs TO service_role;
