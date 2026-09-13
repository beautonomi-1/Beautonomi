-- Migration 901: Multi-vendor AI pricing rows for Gateway model IDs

INSERT INTO public.ai_model_pricing (model, input_usd_per_1k, output_usd_per_1k, notes)
VALUES
  ('google/gemini-2.5-flash-lite', 0.00010000, 0.00040000, 'Gateway alias; Google list price Sep 2026'),
  ('google/gemini-2.5-flash', 0.00030000, 0.00250000, 'Gateway alias; Google list price Sep 2026'),
  ('openai/gpt-4.1-mini', 0.00040000, 0.00160000, 'OpenAI list price Sep 2026'),
  ('anthropic/claude-sonnet-4.5', 0.00300000, 0.01500000, 'Anthropic list price Sep 2026'),
  ('openai/text-embedding-3-small', 0.00002000, 0.00000000, 'OpenAI embedding list price Sep 2026')
ON CONFLICT (model) DO NOTHING;
