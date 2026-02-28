-- Feature flags for on-demand accept flow (Uber-style: customer requests -> provider must accept/decline)
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
VALUES
  ('on_demand_accept_enabled', 'On-demand accept (global)', 'Master switch for on-demand request/accept flow', false, 'control_plane'),
  ('on_demand_accept_customer_enabled', 'On-demand accept (customer)', 'Show "Request now" and waiting/result screens in customer app', false, 'control_plane'),
  ('on_demand_accept_provider_enabled', 'On-demand accept (provider)', 'Show incoming request overlay and accept/decline in provider app and portal', false, 'control_plane')
ON CONFLICT (feature_key) DO NOTHING;
