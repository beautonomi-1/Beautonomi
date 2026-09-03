-- Migration 874: per-model AI pricing table used to compute ai_usage_log.cost_estimate
-- and agent_steps.cost_usd from Gemini usage metadata. Admin-editable; the runtime
-- caches it for 5 minutes (apps/web/src/lib/ai/pricing.ts) and falls back to the
-- in-code defaults when a model has no active row.
--
-- Prices are USD per 1,000 tokens (Google list prices for the <=200k context tier).

CREATE TABLE IF NOT EXISTS public.ai_model_pricing (
  model TEXT PRIMARY KEY,
  input_usd_per_1k NUMERIC(12, 8) NOT NULL CHECK (input_usd_per_1k >= 0),
  output_usd_per_1k NUMERIC(12, 8) NOT NULL CHECK (output_usd_per_1k >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_model_pricing IS
  'USD per 1k input/output tokens per model. Drives ai_usage_log.cost_estimate and agent_runs.total_cost_usd.';

CREATE INDEX IF NOT EXISTS idx_ai_model_pricing_active ON public.ai_model_pricing(is_active, effective_from DESC);

ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmins can manage ai_model_pricing" ON public.ai_model_pricing;
CREATE POLICY "Superadmins can manage ai_model_pricing"
  ON public.ai_model_pricing FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'superadmin')
  );

DROP TRIGGER IF EXISTS update_ai_model_pricing_updated_at ON public.ai_model_pricing;
CREATE TRIGGER update_ai_model_pricing_updated_at
  BEFORE UPDATE ON public.ai_model_pricing FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed every Gemini model referenced in code:
--   apps/web/src/lib/ai/feature-templates.ts       -> gemini-2.5-flash-lite
--   packages/agent-model-router/src/router.ts      -> gemini-2.5-flash-lite / gemini-2.5-flash / gemini-2.5-pro
--   apps/web/src/lib/agents/llm.ts (default model) -> gemini-2.0-flash
INSERT INTO public.ai_model_pricing (model, input_usd_per_1k, output_usd_per_1k, notes)
VALUES
  ('gemini-2.5-flash-lite', 0.00010000, 0.00040000, 'Google list price: $0.10 / $0.40 per 1M tokens'),
  ('gemini-2.5-flash',      0.00030000, 0.00250000, 'Google list price: $0.30 / $2.50 per 1M tokens'),
  ('gemini-2.5-pro',        0.00125000, 0.01000000, 'Google list price (<=200k ctx): $1.25 / $10.00 per 1M tokens'),
  ('gemini-2.0-flash',      0.00010000, 0.00040000, 'Google list price: $0.10 / $0.40 per 1M tokens')
ON CONFLICT (model) DO NOTHING;
