-- Provider-scoped supplier directory (contact details, etc.).
-- products.supplier (text) remains for backward compatibility; this table is for full supplier records.

CREATE TABLE IF NOT EXISTS product_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  website TEXT,
  notes TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('hair', 'skincare', 'nails', 'equipment', 'general')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_provider ON product_suppliers(provider_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_name ON product_suppliers(provider_id, name);

DROP TRIGGER IF EXISTS trg_product_suppliers_updated_at ON product_suppliers;
CREATE TRIGGER trg_product_suppliers_updated_at
  BEFORE UPDATE ON product_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE product_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers can manage own product_suppliers" ON product_suppliers;
CREATE POLICY "Providers can manage own product_suppliers"
  ON product_suppliers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM providers
      WHERE providers.id = product_suppliers.provider_id
      AND (providers.user_id = auth.uid() OR
           EXISTS (
             SELECT 1 FROM provider_staff
             WHERE provider_staff.provider_id = providers.id
             AND provider_staff.user_id = auth.uid()
           ))
    )
  );

COMMENT ON TABLE product_suppliers IS 'Provider-scoped supplier directory; products.supplier (text) remains for product assignment.';
