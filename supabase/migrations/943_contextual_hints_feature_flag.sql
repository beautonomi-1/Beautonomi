-- Kill switch for one-time contextual hints on customer and provider mobile apps.
-- Persistent money and blocker copy is not gated by this flag.

INSERT INTO public.feature_flags (feature_key, feature_name, description, enabled, category)
SELECT
    'contextual_hints',
    'Contextual hints (mobile)',
    'Show dismissible one-time contextual hints on customer and provider mobile apps. Persistent checkout and payout helper text stays visible when disabled.',
    true,
    'product'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.feature_flags
    WHERE feature_key = 'contextual_hints'
      AND tenant_id IS NULL
);
