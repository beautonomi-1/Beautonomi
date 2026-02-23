-- Seed feature flags for control plane modules (if not present)
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category)
VALUES
  ('ads.enabled', 'Ads module', 'Enable paid ads (boosted listings / sponsored slots)', false, 'control_plane'),
  ('ads.sponsored_slots.enabled', 'Sponsored slots', 'Inject sponsored slots in feed/search', false, 'control_plane'),
  ('ads.boost_credits.enabled', 'Boost credits', 'Enable boost credits model', false, 'control_plane'),
  ('ranking.enabled', 'Ranking module', 'Enable provider quality scoring and discoverability', false, 'control_plane'),
  ('ranking.use_quality_score', 'Use quality score', 'Use computed quality score in search/sort', false, 'control_plane'),
  ('distance.enabled', 'Distance module', 'Enable distance filter and service radius', false, 'control_plane'),
  ('distance.filter.enabled', 'Distance filter', 'Apply radius filter in search', false, 'control_plane'),
  ('distance.provider_radius.enabled', 'Provider radius', 'Allow providers to set service radius', false, 'control_plane'),
  ('safety.enabled', 'Safety module', 'Enable safety button (panic / check-in)', false, 'control_plane'),
  ('safety.panic.enabled', 'Panic button', 'Show panic button in app', false, 'control_plane'),
  ('safety.check_in.enabled', 'Check-in', 'Enable check-in flow', false, 'control_plane'),
  ('verification.sumsub.enabled', 'Sumsub verification', 'Use Sumsub SDK for provider verification', false, 'control_plane'),
  ('verification.sumsub.required_for_payouts', 'Sumsub required for payouts', 'Block payouts until Sumsub approved', false, 'control_plane')
ON CONFLICT (feature_key) DO NOTHING;
