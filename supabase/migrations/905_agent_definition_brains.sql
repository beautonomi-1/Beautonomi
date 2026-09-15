-- Migration 905: Per-agent model preferences and run cost fuse.

ALTER TABLE public.agent_definitions
  ADD COLUMN IF NOT EXISTS preferred_model_id TEXT,
  ADD COLUMN IF NOT EXISTS fallback_model_id TEXT,
  ADD COLUMN IF NOT EXISTS task_default TEXT CHECK (
    task_default IS NULL OR task_default IN (
      'classification', 'extraction', 'drafting', 'summarization', 'complex_reasoning', 'copilot'
    )
  ),
  ADD COLUMN IF NOT EXISTS max_cost_usd_per_run NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS vision_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_locale_mode TEXT NOT NULL DEFAULT 'recipient'
    CHECK (reply_locale_mode IN ('recipient', 'platform_en', 'agent_default'));

COMMENT ON COLUMN public.agent_definitions.preferred_model_id IS
  'Vercel AI Gateway model id (provider/model) or bare Gemini id for direct_gemini rollback.';
COMMENT ON COLUMN public.agent_definitions.task_default IS
  'Default ModelTask for routeModel when the workflow does not override.';
COMMENT ON COLUMN public.agent_definitions.max_cost_usd_per_run IS
  'Per-run USD fuse passed to routeModel maxCostUsd (copilot and LLM workflows).';
