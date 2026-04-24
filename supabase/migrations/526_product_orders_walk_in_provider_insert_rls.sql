-- =============================================================================
-- 526: Allow providers to INSERT walk-in product orders and line items (RLS)
-- =============================================================================
-- Migration 232 only allowed product_orders INSERT when auth.uid() = customer_id
-- (customer-initiated checkout). POST /api/provider/product-sales uses the provider
-- JWT and sets order_source = walk_in with customer_id NULL or a saved client id —
-- those rows must pass RLS.
--
-- Online customer orders remain covered by the existing "Authenticated users can
-- create orders" policy (order_source = online, customer_id = auth.uid()).

DROP POLICY IF EXISTS "Providers insert walk_in product_orders" ON public.product_orders;
CREATE POLICY "Providers insert walk_in product_orders"
  ON public.product_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    order_source = 'walk_in'
    AND provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
      UNION
      SELECT provider_id FROM public.provider_staff
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      customer_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.provider_clients pc
        WHERE pc.provider_id = product_orders.provider_id
          AND pc.customer_id = product_orders.customer_id
      )
    )
  );

COMMENT ON POLICY "Providers insert walk_in product_orders" ON public.product_orders IS
  'Provider app walk-in retail: insert product_orders with order_source walk_in; optional customer_id must be a saved provider_client.';

-- Line items: only customers could insert (order owned by auth.uid()). Providers
-- inserting items right after creating a walk-in order need this path.
DROP POLICY IF EXISTS "Providers insert product_order_items for own orders" ON public.product_order_items;
CREATE POLICY "Providers insert product_order_items for own orders"
  ON public.product_order_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.product_orders po
      WHERE po.id = product_order_items.order_id
        AND po.provider_id IN (
          SELECT id FROM public.providers WHERE user_id = auth.uid()
          UNION
          SELECT provider_id FROM public.provider_staff
          WHERE user_id = auth.uid() AND is_active = true
        )
    )
  );

COMMENT ON POLICY "Providers insert product_order_items for own orders" ON public.product_order_items IS
  'Provider POS / walk-in: add product_order_items rows for orders belonging to the signed-in provider team.';
