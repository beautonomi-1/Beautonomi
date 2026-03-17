-- Allow provider-scoped promotions: same code per provider, one platform-wide per code.
-- Platform promos have provider_id NULL; provider-created promos have provider_id set.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_promotions_provider_id ON promotions(provider_id) WHERE provider_id IS NOT NULL;

-- Replace code UNIQUE with (code, provider_id): one row per code when provider_id IS NULL, one per (code, provider_id) when set.
ALTER TABLE promotions
  DROP CONSTRAINT IF EXISTS promotions_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_code_provider
  ON promotions (code, COALESCE(provider_id::text, '00000000-0000-0000-0000-000000000000'));

COMMENT ON COLUMN promotions.provider_id IS 'When set, this promotion is scoped to this provider. NULL = platform-wide (optional applicable_providers).';

-- Let providers manage their own promotions (provider_id = their provider)
DROP POLICY IF EXISTS "Providers can manage own promotions" ON promotions;
CREATE POLICY "Providers can manage own promotions"
  ON promotions FOR ALL
  USING (
    provider_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = promotions.provider_id
      AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()))
    )
  )
  WITH CHECK (
    provider_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = promotions.provider_id
      AND (p.user_id = auth.uid() OR EXISTS (SELECT 1 FROM provider_staff ps WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()))
    )
  );
