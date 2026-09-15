-- Migration 904: Allow agent workforce to write ai_usage_log (agent principals are not auth users).

ALTER TABLE public.ai_usage_log
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_agent_created
  ON public.ai_usage_log(agent_id, created_at DESC)
  WHERE agent_id IS NOT NULL;

ALTER TABLE public.ai_usage_log
  DROP CONSTRAINT IF EXISTS ai_usage_log_actor_or_agent;

ALTER TABLE public.ai_usage_log
  ADD CONSTRAINT ai_usage_log_actor_or_agent CHECK (
    actor_user_id IS NOT NULL OR agent_id IS NOT NULL
  );

COMMENT ON COLUMN public.ai_usage_log.agent_id IS
  'Set when the call originated from an agent workforce principal (agent_definitions.id).';
