-- Stock movement audit log for provider products (manual adjustments, sales, bookings).
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'manual_in', 'manual_out', 'stock_count', 'damaged', 'returned', 'received',
      'sale', 'sale_refund', 'booking', 'booking_revert', 'initial'
    )
  ),
  quantity_delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  reason TEXT,
  note TEXT,
  reference_type TEXT,
  reference_id UUID,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_provider ON public.stock_movements(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON public.stock_movements(product_variant_id, created_at DESC)
  WHERE product_variant_id IS NOT NULL;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers manage own stock movements" ON public.stock_movements;
CREATE POLICY "Providers manage own stock movements"
  ON public.stock_movements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = stock_movements.provider_id
      AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = stock_movements.provider_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Superadmins select stock movements" ON public.stock_movements;
CREATE POLICY "Superadmins select stock movements"
  ON public.stock_movements FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
  );

COMMENT ON TABLE public.stock_movements IS 'Audit log of product inventory changes (manual, POS sales, bookings).';
