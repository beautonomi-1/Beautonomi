-- Future Rendobar adapters: seeded OFF until product enables after staging sign-off.
INSERT INTO feature_flags (feature_key, feature_name, description, enabled, category, metadata)
SELECT v.feature_key, v.feature_name, v.description, v.enabled, v.category, v.metadata
FROM (
  VALUES
    (
      'explore.rendobar_ai_captions',
      'Explore Rendobar AI captions',
      'When ON (future): auto-transcribe and burn stylized captions via Rendobar. OFF uses manual overlays only.',
      false,
      'explore',
      '{}'::jsonb
    ),
    (
      'explore.rendobar_timeline_compose',
      'Explore Rendobar timeline compose',
      'When ON (future): multi-track JSON timeline jobs. OFF uses single-input ffmpeg encode.',
      false,
      'explore',
      '{}'::jsonb
    ),
    (
      'explore.rendobar_smart_compression',
      'Explore Rendobar smart compression',
      'When ON (future): target-size/quality compression jobs. OFF uses CRF 23 preset fast.',
      false,
      'explore',
      '{"crf":23,"preset":"fast"}'::jsonb
    )
) AS v(feature_key, feature_name, description, enabled, category, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags ff WHERE ff.feature_key = v.feature_key AND ff.tenant_id IS NULL
);
