-- ============================================================================
-- Migration 178: Add VAT Registration Fields for South Africa
-- ============================================================================
-- This migration adds fields to support VAT-registered and non-VAT providers
-- in South Africa, where VAT registration is optional for businesses making
-- less than R1 million per year.
-- ============================================================================

-- Add VAT registration status field
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS is_vat_registered BOOLEAN DEFAULT false;

-- Add VAT number field (optional, for VAT-registered providers)
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS vat_number TEXT;

-- Add constraint: VAT number required if VAT registered
ALTER TABLE providers
  ADD CONSTRAINT check_vat_number_if_registered 
  CHECK (
    (is_vat_registered = false) OR 
    (is_vat_registered = true AND vat_number IS NOT NULL AND vat_number != '')
  );

-- Add index for VAT number lookups
CREATE INDEX IF NOT EXISTS idx_providers_vat_number 
  ON providers(vat_number) 
  WHERE vat_number IS NOT NULL;

-- Add index for VAT registration status
CREATE INDEX IF NOT EXISTS idx_providers_is_vat_registered 
  ON providers(is_vat_registered);

-- Update existing providers: if tax_rate_percent > 0, assume VAT registered
-- (This is a safe assumption for South Africa where VAT is 15%)
UPDATE providers
SET is_vat_registered = true
WHERE tax_rate_percent > 0 
  AND tax_rate_percent <= 15
  AND is_vat_registered IS NULL;

-- Add comments
COMMENT ON COLUMN providers.is_vat_registered IS 'Whether the provider is VAT registered with SARS (South Africa). VAT registration is mandatory for businesses with annual turnover >= R1 million.';
COMMENT ON COLUMN providers.vat_number IS 'SARS VAT registration number (format: 4XXXXXXXXX). Required if is_vat_registered is true.';
COMMENT ON COLUMN providers.tax_rate_percent IS 'Tax rate percentage (0% for non-VAT providers, 15% for VAT-registered providers in South Africa).';
