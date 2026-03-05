-- Seed ranking_module_config for each environment so the control plane Ranking page has a row to load.
-- Default: enabled false, weights for reviews_score, completion_rate, cancellations, response_time.
INSERT INTO ranking_module_config (environment, enabled, weights, created_at, updated_at)
VALUES
  ('production', false, '{"reviews_score": 0.3, "completion_rate": 0.3, "cancellations": 0.2, "response_time": 0.2}'::jsonb, NOW(), NOW()),
  ('staging', false, '{"reviews_score": 0.3, "completion_rate": 0.3, "cancellations": 0.2, "response_time": 0.2}'::jsonb, NOW(), NOW()),
  ('development', false, '{"reviews_score": 0.3, "completion_rate": 0.3, "cancellations": 0.2, "response_time": 0.2}'::jsonb, NOW(), NOW())
ON CONFLICT (environment) DO NOTHING;
