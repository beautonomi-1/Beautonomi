-- Make provider onboarding match runtime defaults for tips and travel fees.

-- Conservative backfill: only flip recent onboarding-created providers whose
-- record has not been materially edited after signup. Providers who disabled
-- tips later from settings should have a later updated_at and are left alone.
UPDATE providers
SET tips_enabled = true,
    updated_at = NOW()
WHERE tips_enabled = false
  AND created_at >= TIMESTAMPTZ '2026-05-01'
  AND onboarding_state IN ('ready_for_activation', 'activated')
  AND (
    updated_at IS NULL
    OR updated_at <= created_at + INTERVAL '10 minutes'
  );

-- Existing house-call providers should have an explicit travel-fee row instead
-- of relying on an invisible API fallback. They still inherit platform defaults.
INSERT INTO provider_travel_fee_settings (
  provider_id,
  enabled,
  rate_per_km,
  minimum_fee,
  maximum_fee,
  currency,
  use_platform_default,
  created_at,
  updated_at
)
SELECT
  p.id,
  true,
  COALESCE((ps.settings->'travel_fees'->>'default_rate_per_km')::numeric, 8),
  COALESCE((ps.settings->'travel_fees'->>'default_minimum_fee')::numeric, 20),
  NULLIF((ps.settings->'travel_fees'->>'default_maximum_fee')::numeric, 0),
  COALESCE(ps.settings->'travel_fees'->>'default_currency', 'ZAR'),
  true,
  NOW(),
  NOW()
FROM providers p
LEFT JOIN LATERAL (
  SELECT settings
  FROM platform_settings
  WHERE is_active = true
    AND (tenant_id = p.tenant_id OR tenant_id IS NULL)
  ORDER BY CASE WHEN tenant_id = p.tenant_id THEN 0 ELSE 1 END, updated_at DESC
  LIMIT 1
) ps ON true
WHERE (
    p.business_type = 'freelancer'
    OR EXISTS (
      SELECT 1
      FROM offerings o
      WHERE o.provider_id = p.id
        AND o.is_active = true
        AND o.supports_at_home = true
    )
  )
ON CONFLICT (provider_id) DO NOTHING;
