-- Grant admin.searchKnowledge to admin-copilot for Knowledge Base how-to answers.

INSERT INTO public.agent_tool_grants (
  agent_id, tool_name, tool_version, risk_ceiling, max_rows, max_output_bytes, rate_limit_per_min
)
SELECT d.id, g.tool_name, '1', g.risk_ceiling, g.max_rows, g.max_output_bytes, g.rate_limit
FROM public.agent_definitions d
JOIN (VALUES
  ('admin-copilot', 'admin.searchKnowledge', 0, 10, 32768, 60)
) AS g(agent_key, tool_name, risk_ceiling, max_rows, max_output_bytes, rate_limit)
  ON d.key = g.agent_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_tool_grants g2
  WHERE g2.agent_id = d.id AND g2.tool_name = g.tool_name AND g2.tool_version = '1'
);
