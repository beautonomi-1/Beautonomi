-- Copilot provider + trust read tools.

INSERT INTO public.agent_tool_grants (
  agent_id, tool_name, tool_version, risk_ceiling, max_rows, max_output_bytes, rate_limit_per_min
)
SELECT d.id, g.tool_name, '1', g.risk_ceiling, g.max_rows, g.max_output_bytes, g.rate_limit
FROM public.agent_definitions d
JOIN (VALUES
  ('admin-copilot', 'provider.readProfileSummary', 1, 1, 16384, 60),
  ('admin-copilot', 'provider.readOnboardingProgress', 1, 1, 8192, 60),
  ('admin-copilot', 'support.listOpenTicketsForProvider', 1, 10, 16384, 60),
  ('admin-copilot', 'trust.readProviderRiskSummary', 3, 20, 8192, 30),
  ('admin-copilot', 'trust.readUserRiskSummary', 3, 20, 8192, 30)
) AS g(agent_key, tool_name, risk_ceiling, max_rows, max_output_bytes, rate_limit)
  ON d.key = g.agent_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_tool_grants g2
  WHERE g2.agent_id = d.id AND g2.tool_name = g.tool_name AND g2.tool_version = '1'
);
