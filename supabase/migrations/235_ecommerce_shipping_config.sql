-- ============================================================================
-- Migration 235: Provider Shipping Configuration
-- ============================================================================
-- Per-provider delivery and collection settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS provider_shipping_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
    offers_delivery BOOLEAN DEFAULT false,
    offers_collection BOOLEAN DEFAULT true,
    delivery_fee NUMERIC(10,2) DEFAULT 0 CHECK (delivery_fee >= 0),
    free_delivery_threshold NUMERIC(10,2) CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
    delivery_radius_km NUMERIC(6,2) CHECK (delivery_radius_km IS NULL OR delivery_radius_km > 0),
    estimated_delivery_days INTEGER DEFAULT 3 CHECK (estimated_delivery_days > 0),
    delivery_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_shipping_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shipping_config_updated_at
  BEFORE UPDATE ON provider_shipping_config
  FOR EACH ROW EXECUTE FUNCTION update_shipping_config_updated_at();

-- RLS
ALTER TABLE provider_shipping_config ENABLE ROW LEVEL SECURITY;

-- Public read (customers need to see delivery options)
CREATE POLICY "Anyone can read shipping config"
  ON provider_shipping_config FOR SELECT
  USING (true);

-- Providers manage their own config
CREATE POLICY "Providers manage own shipping config"
  ON provider_shipping_config FOR ALL
  USING (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    provider_id IN (
      SELECT id FROM providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM provider_staff WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Superadmin full access provider_shipping_config"
  ON provider_shipping_config FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin'));
