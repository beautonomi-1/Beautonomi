-- Commerce / membership order tables (376 tenant_id): tenant ops with user_tenant_roles
-- can SELECT rows scoped to their tenant. Complements customer/provider policies on these tables.

-- ── membership_orders ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant role holders select membership_orders" ON public.membership_orders;
CREATE POLICY "Tenant role holders select membership_orders"
  ON public.membership_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = membership_orders.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select membership_orders" ON public.membership_orders IS
  'Tenant-scoped read for user_tenant_roles (spec §6.1). Requires NOT NULL tenant_id (376).';

-- ── product_orders ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant role holders select product_orders" ON public.product_orders;
CREATE POLICY "Tenant role holders select product_orders"
  ON public.product_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = product_orders.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select product_orders" ON public.product_orders IS
  'Tenant-scoped read for user_tenant_roles (spec §6.1). Requires NOT NULL tenant_id (376).';

-- ── gift_card_orders ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Tenant role holders select gift_card_orders" ON public.gift_card_orders;
CREATE POLICY "Tenant role holders select gift_card_orders"
  ON public.gift_card_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.tenant_id = gift_card_orders.tenant_id
        AND utr.is_active = true
    )
  );

COMMENT ON POLICY "Tenant role holders select gift_card_orders" ON public.gift_card_orders IS
  'Tenant-scoped read for user_tenant_roles (spec §6.1). Requires NOT NULL tenant_id (376).';
