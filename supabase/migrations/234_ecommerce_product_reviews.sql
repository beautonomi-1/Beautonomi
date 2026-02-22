-- ============================================================================
-- Migration 234: Product Reviews
-- ============================================================================
-- Review + rating system for purchased products
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id UUID REFERENCES product_orders(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    comment TEXT,
    image_urls TEXT[] DEFAULT '{}',
    is_verified_purchase BOOLEAN DEFAULT false,
    is_visible BOOLEAN DEFAULT true,
    is_flagged BOOLEAN DEFAULT false,
    flagged_reason TEXT,
    helpful_count INTEGER DEFAULT 0,
    provider_response TEXT,
    provider_response_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, customer_id, order_id)
);

CREATE TABLE IF NOT EXISTS product_review_helpful_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_customer ON product_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_rating ON product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created ON product_reviews(created_at DESC);

CREATE OR REPLACE FUNCTION update_product_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_reviews_updated_at
  BEFORE UPDATE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_reviews_updated_at();

-- RLS
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_review_helpful_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can read visible reviews
CREATE POLICY "Anyone can read visible reviews"
  ON product_reviews FOR SELECT
  USING (is_visible = true);

-- Customers can create reviews
CREATE POLICY "Customers can create reviews"
  ON product_reviews FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Customers can update their own reviews
CREATE POLICY "Customers can update own reviews"
  ON product_reviews FOR UPDATE
  USING (auth.uid() = customer_id);

-- Providers can update reviews (for response only)
CREATE POLICY "Providers can respond to reviews"
  ON product_reviews FOR UPDATE
  USING (
    product_id IN (
      SELECT p.id FROM products p
      JOIN providers pr ON pr.id = p.provider_id
      WHERE pr.user_id = auth.uid()
    )
  );

-- Helpful votes
CREATE POLICY "Users manage own helpful votes"
  ON product_review_helpful_votes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read helpful votes"
  ON product_review_helpful_votes FOR SELECT
  USING (true);

-- Superadmin
CREATE POLICY "Superadmin full access product_reviews"
  ON product_reviews FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin'));

CREATE POLICY "Superadmin full access product_review_helpful_votes"
  ON product_review_helpful_votes FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin'));
