-- Product flags for ticket-thread AI assistant (off until ops enables rollout).
INSERT INTO public.feature_flags (
  feature_key,
  feature_name,
  description,
  enabled,
  category,
  rollout_percent,
  environments_allowed
)
VALUES
  (
    'support.ai_assistant.customer',
    'Support AI assistant (customer)',
    'Chat-first support assistant on customer web and mobile tickets.',
    false,
    'support',
    0,
    ARRAY['staging', 'development']::text[]
  ),
  (
    'support.ai_assistant.provider',
    'Support AI assistant (provider)',
    'Chat-first support assistant on provider web and mobile tickets.',
    false,
    'support',
    0,
    ARRAY['staging', 'development']::text[]
  )
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO UPDATE
  SET description = EXCLUDED.description,
      category = EXCLUDED.category;
