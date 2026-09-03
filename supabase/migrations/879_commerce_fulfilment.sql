-- 879: Commerce end to end (Part I) — line-level fulfilment, product checkout tenders
--      (promotion code + gift card), gift-card reserve/capture/void keyed by product order,
--      walk-in staff attribution FK, stock movement types for cancel/return, and the
--      "partially shipped" customer notification template.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Line-level fulfilment on product_order_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_order_items
  ADD COLUMN IF NOT EXISTS fulfilment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fulfilled_qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfilment_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.product_order_items
    DROP CONSTRAINT IF EXISTS product_order_items_fulfilment_status_check;
  ALTER TABLE public.product_order_items
    ADD CONSTRAINT product_order_items_fulfilment_status_check
    CHECK (fulfilment_status IN ('pending', 'packed', 'shipped', 'delivered', 'cancelled'));
  ALTER TABLE public.product_order_items
    DROP CONSTRAINT IF EXISTS product_order_items_fulfilled_qty_check;
  ALTER TABLE public.product_order_items
    ADD CONSTRAINT product_order_items_fulfilled_qty_check
    CHECK (fulfilled_qty >= 0);
END $$;

COMMENT ON COLUMN public.product_order_items.fulfilment_status IS
  'Per-line fulfilment state (pending → packed → shipped → delivered | cancelled). Order-level status is derived from all lines.';
COMMENT ON COLUMN public.product_order_items.fulfilled_qty IS
  'Units shipped/delivered for this line (partial shipments).';

CREATE INDEX IF NOT EXISTS idx_product_order_items_fulfilment
  ON public.product_order_items(order_id, fulfilment_status);

-- ---------------------------------------------------------------------------
-- 2. Product checkout tenders: promotion + gift card on product_orders
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_code TEXT,
  ADD COLUMN IF NOT EXISTS promotion_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gift_card_id UUID REFERENCES public.gift_cards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_card_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE public.product_orders
    DROP CONSTRAINT IF EXISTS product_orders_promotion_discount_amount_check;
  ALTER TABLE public.product_orders
    ADD CONSTRAINT product_orders_promotion_discount_amount_check
    CHECK (promotion_discount_amount >= 0);
  ALTER TABLE public.product_orders
    DROP CONSTRAINT IF EXISTS product_orders_gift_card_amount_check;
  ALTER TABLE public.product_orders
    ADD CONSTRAINT product_orders_gift_card_amount_check
    CHECK (gift_card_amount >= 0);
END $$;

COMMENT ON COLUMN public.product_orders.gift_card_amount IS
  'Gift card tender applied at checkout. Amount due online = total_amount - wallet_amount - gift_card_amount.';
COMMENT ON COLUMN public.product_orders.promotion_discount_amount IS
  'Promo-code discount included in discount_amount; posted as a promotion_discount ledger leg when paid.';

CREATE INDEX IF NOT EXISTS idx_product_orders_gift_card_id
  ON public.product_orders(gift_card_id) WHERE gift_card_id IS NOT NULL;

-- promotion_usage: allow product-order redemptions (booking_id stays NULL)
ALTER TABLE public.promotion_usage
  ADD COLUMN IF NOT EXISTS product_order_id UUID REFERENCES public.product_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_promotion_usage_product_order
  ON public.promotion_usage(promotion_id, user_id, product_order_id)
  WHERE product_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Gift card redemptions keyed by product order (reserve → capture / void)
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_card_redemptions
  ADD COLUMN IF NOT EXISTS product_order_id UUID REFERENCES public.product_orders(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gift_card_redemptions_product_order
  ON public.gift_card_redemptions(product_order_id)
  WHERE product_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_gift_card_redemption_for_order(
  p_code TEXT,
  p_amount NUMERIC,
  p_product_order_id UUID,
  p_currency TEXT DEFAULT 'ZAR'
)
RETURNS TABLE (gift_card_id UUID, redemption_id UUID, remaining_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gift_card public.gift_cards%ROWTYPE;
  v_redemption public.gift_card_redemptions%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.product_orders po
      WHERE po.id = p_product_order_id AND po.customer_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  -- idempotency: one redemption per product order
  SELECT * INTO v_redemption
  FROM public.gift_card_redemptions
  WHERE product_order_id = p_product_order_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_redemption.gift_card_id, v_redemption.id, NULL::NUMERIC;
    RETURN;
  END IF;

  SELECT * INTO v_gift_card
  FROM public.gift_cards
  WHERE UPPER(code) = UPPER(TRIM(p_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid gift card code';
  END IF;

  IF v_gift_card.currency <> p_currency THEN
    RAISE EXCEPTION 'Gift card currency mismatch';
  END IF;

  UPDATE public.gift_cards
    SET balance = balance - p_amount
  WHERE id = v_gift_card.id AND balance >= p_amount
  RETURNING * INTO v_gift_card;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient gift card balance';
  END IF;

  INSERT INTO public.gift_card_redemptions (
    gift_card_id, booking_id, product_order_id, user_id, amount, currency, status, reserved_at
  ) VALUES (
    v_gift_card.id, NULL, p_product_order_id, auth.uid(), p_amount, p_currency, 'reserved', NOW()
  )
  RETURNING * INTO v_redemption;

  RETURN QUERY SELECT v_gift_card.id, v_redemption.id, v_gift_card.balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_gift_card_redemption_for_order(p_product_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_redemption public.gift_card_redemptions%ROWTYPE;
  v_gift_card public.gift_cards%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.product_orders po
      WHERE po.id = p_product_order_id AND po.customer_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_redemption
  FROM public.gift_card_redemptions
  WHERE product_order_id = p_product_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_redemption.status = 'captured' THEN
    RETURN TRUE;
  END IF;

  IF v_redemption.status <> 'reserved' THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_gift_card FROM public.gift_cards WHERE id = v_redemption.gift_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  IF (v_gift_card.expires_at IS NOT NULL AND v_gift_card.expires_at < NOW()) OR NOT v_gift_card.is_active THEN
    UPDATE public.gift_cards SET balance = balance + v_redemption.amount WHERE id = v_redemption.gift_card_id;
    UPDATE public.gift_card_redemptions SET status = 'voided', voided_at = NOW()
      WHERE id = v_redemption.id AND status = 'reserved';
    RAISE EXCEPTION 'Gift card is no longer redeemable. Redemption voided and balance restored.';
  END IF;

  UPDATE public.gift_card_redemptions
    SET status = 'captured', captured_at = NOW()
  WHERE id = v_redemption.id AND status = 'reserved';

  RETURN TRUE;
END;
$$;

-- Void restores balance for reserved OR captured (cancel / refund parity with 027).
CREATE OR REPLACE FUNCTION public.void_gift_card_redemption_for_order(p_product_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_redemption public.gift_card_redemptions%ROWTYPE;
  v_allowed BOOLEAN := FALSE;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_allowed := TRUE;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.product_orders po
      WHERE po.id = p_product_order_id AND po.customer_id = auth.uid()
    ) INTO v_allowed;
  END IF;

  IF v_allowed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_redemption
  FROM public.gift_card_redemptions
  WHERE product_order_id = p_product_order_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_redemption.status = 'voided' THEN
    RETURN TRUE;
  END IF;

  IF v_redemption.status IN ('reserved', 'captured') THEN
    UPDATE public.gift_cards
      SET balance = balance + v_redemption.amount
    WHERE id = v_redemption.gift_card_id;

    UPDATE public.gift_card_redemptions
      SET status = 'voided', voided_at = NOW()
    WHERE id = v_redemption.id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_gift_card_redemption_for_order(TEXT, NUMERIC, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_gift_card_redemption_for_order(TEXT, NUMERIC, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_gift_card_redemption_for_order(TEXT, NUMERIC, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.capture_gift_card_redemption_for_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_gift_card_redemption_for_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.capture_gift_card_redemption_for_order(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.void_gift_card_redemption_for_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_gift_card_redemption_for_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_gift_card_redemption_for_order(UUID) TO authenticated, service_role;

-- Safety net: any path that cancels an UNPAID product order (checkout rollback,
-- stale-order sweep, charge.failed webhook, expire cron) releases a still-reserved
-- gift card even if the TypeScript caller did not void it explicitly.
CREATE OR REPLACE FUNCTION public.product_orders_release_gift_card_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND COALESCE(OLD.status, '') <> 'cancelled'
     AND NEW.payment_status <> 'paid'
     AND COALESCE(NEW.gift_card_amount, 0) > 0
  THEN
    UPDATE public.gift_cards gc
      SET balance = gc.balance + r.amount
    FROM public.gift_card_redemptions r
    WHERE r.product_order_id = NEW.id
      AND r.status = 'reserved'
      AND gc.id = r.gift_card_id;

    UPDATE public.gift_card_redemptions
      SET status = 'voided', voided_at = NOW()
    WHERE product_order_id = NEW.id AND status = 'reserved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_orders_release_gift_card_on_cancel ON public.product_orders;
CREATE TRIGGER trg_product_orders_release_gift_card_on_cancel
  AFTER UPDATE OF status ON public.product_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.product_orders_release_gift_card_on_cancel();

-- ---------------------------------------------------------------------------
-- 4. Walk-in attribution: product_orders.staff_id → provider_staff(id)
--    (240 pointed it at users(id); commission + sales history need the roster id).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.conrelid = 'public.product_orders'::regclass
    AND c.contype = 'f'
    AND a.attname = 'staff_id'
    AND c.confrelid = 'public.users'::regclass
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.product_orders DROP CONSTRAINT %I', v_conname);

    -- Backfill: user id → that user's provider_staff row for the same provider.
    UPDATE public.product_orders po
    SET staff_id = ps.id
    FROM public.provider_staff ps
    WHERE po.staff_id IS NOT NULL
      AND ps.user_id = po.staff_id
      AND ps.provider_id = po.provider_id;

    -- Anything left that is not a provider_staff id cannot be attributed.
    UPDATE public.product_orders po
    SET staff_id = NULL
    WHERE po.staff_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.provider_staff ps WHERE ps.id = po.staff_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_orders_staff_id_provider_staff_fkey'
      AND conrelid = 'public.product_orders'::regclass
  ) THEN
    ALTER TABLE public.product_orders
      ADD CONSTRAINT product_orders_staff_id_provider_staff_fkey
      FOREIGN KEY (staff_id) REFERENCES public.provider_staff(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.product_orders.staff_id IS
  'provider_staff.id who processed the walk-in sale (commission attribution). Re-pointed from users(id) in 879.';

CREATE INDEX IF NOT EXISTS idx_product_orders_walk_in_staff
  ON public.product_orders(provider_id, staff_id, paid_at)
  WHERE order_source = 'walk_in' AND staff_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. stock_movements: cancel / return movement types
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
  ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_movement_type_check
    CHECK (
      movement_type IN (
        'manual_in', 'manual_out', 'stock_count', 'damaged', 'returned', 'received',
        'sale', 'sale_refund', 'booking', 'booking_revert', 'initial',
        'cancel', 'return'
      )
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON public.stock_movements(reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Notification template: partially shipped
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, variables, url, enabled, description
)
VALUES (
  NULL,
  'product_order_partially_shipped',
  'Part of Your Order Has Shipped',
  '{{shipped_count}} of {{total_count}} items from order {{order_number}} have shipped. {{tracking_info}}',
  ARRAY['push', 'email']::TEXT[],
  'Part of Your Order Has Shipped - {{order_number}}',
  '<h2>Partial Shipment</h2><p><strong>{{shipped_count}}</strong> of <strong>{{total_count}}</strong> items from order <strong>{{order_number}}</strong> are on their way.</p><p>{{shipped_items}}</p><p>{{tracking_info}}</p><p>The remaining items will follow in a separate shipment.</p>',
  ARRAY['order_number', 'order_id', 'shipped_count', 'total_count', 'shipped_items', 'tracking_number', 'tracking_info', 'carrier']::TEXT[],
  '/product-orders',
  true,
  'Sent to customer once when some (not all) lines of a product order are marked shipped'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  channels = EXCLUDED.channels,
  email_subject = COALESCE(EXCLUDED.email_subject, notification_templates.email_subject),
  email_body = COALESCE(EXCLUDED.email_body, notification_templates.email_body),
  variables = EXCLUDED.variables,
  url = COALESCE(EXCLUDED.url, notification_templates.url),
  enabled = true,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Track the one-time partial-shipment notification on the order.
ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS partially_shipped_notified_at TIMESTAMPTZ;

COMMIT;
