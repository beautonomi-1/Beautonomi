-- Copilot: admin.searchEntities and core read tools for NL resolver.

INSERT INTO public.agent_tool_grants (
  agent_id, tool_name, tool_version, risk_ceiling, max_rows, max_output_bytes, rate_limit_per_min
)
SELECT d.id, g.tool_name, '1', g.risk_ceiling, g.max_rows, g.max_output_bytes, g.rate_limit
FROM public.agent_definitions d
JOIN (VALUES
  ('admin-copilot', 'admin.searchEntities', 0, 15, 16384, 60),
  ('admin-copilot', 'booking.readSummary', 1, 1, 8192, 120),
  ('admin-copilot', 'user.readProfileSummary', 2, 1, 16384, 60),
  ('admin-copilot', 'user.readRecentBookings', 1, 5, 8192, 60),
  ('admin-copilot', 'finance.readProviderSummary', 2, 1, 16384, 30)
) AS g(agent_key, tool_name, risk_ceiling, max_rows, max_output_bytes, rate_limit)
  ON d.key = g.agent_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_tool_grants g2
  WHERE g2.agent_id = d.id AND g2.tool_name = g.tool_name AND g2.tool_version = '1'
);
