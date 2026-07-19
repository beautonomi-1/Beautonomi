-- P0: Remove global authenticated SELECT on gift_cards (code/balance enumeration).
-- Validation and redemption remain via SECURITY DEFINER RPCs and server routes.

DROP POLICY IF EXISTS "Authenticated can read active gift cards" ON public.gift_cards;

-- Purchaser: primary card on order or bulk siblings linked via metadata.order_id
CREATE POLICY gift_cards_select_purchaser
  ON public.gift_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.gift_card_orders gco
      WHERE gco.purchaser_user_id = auth.uid()
        AND gco.status = 'paid'
        AND (
          gco.gift_card_id = gift_cards.id
          OR (gift_cards.metadata->>'order_id') = gco.id::text
        )
    )
  );

-- Recipient: metadata.recipient_email matches signed-in user email
CREATE POLICY gift_cards_select_recipient_email
  ON public.gift_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.email IS NOT NULL
        AND lower(trim(gift_cards.metadata->>'recipient_email')) = lower(trim(u.email))
    )
  );

-- User participated in a redemption for this card
CREATE POLICY gift_cards_select_redemption_user
  ON public.gift_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.gift_card_redemptions gcr
      WHERE gcr.gift_card_id = gift_cards.id
        AND gcr.user_id = auth.uid()
    )
  );

-- Tenant ops read within assigned tenant(s)
CREATE POLICY gift_cards_select_tenant_ops
  ON public.gift_cards
  FOR SELECT
  TO authenticated
  USING (
    gift_cards.tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid()
        AND utr.is_active = true
        AND utr.tenant_id = gift_cards.tenant_id
    )
  );

-- Superadmin finance/ops
CREATE POLICY gift_cards_select_superadmin
  ON public.gift_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'superadmin'
    )
  );

COMMENT ON POLICY gift_cards_select_purchaser ON public.gift_cards IS
  'P0: purchaser may read cards from paid orders (incl. bulk via metadata.order_id).';

-- Lookup by code for checkout — no direct table SELECT; returns balance only when authorized.
CREATE OR REPLACE FUNCTION public.lookup_gift_card_by_code(p_code text)
RETURNS TABLE (
  gift_card_id uuid,
  balance numeric,
  currency text,
  is_active boolean,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.gift_cards%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_row
  FROM public.gift_cards gc
  WHERE upper(trim(gc.code)) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.gift_card_orders gco
      WHERE gco.purchaser_user_id = auth.uid() AND gco.status = 'paid'
        AND (gco.gift_card_id = v_row.id OR (v_row.metadata->>'order_id') = gco.id::text)
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.email IS NOT NULL
        AND lower(trim(v_row.metadata->>'recipient_email')) = lower(trim(u.email))
    )
    OR EXISTS (
      SELECT 1 FROM public.gift_card_redemptions gcr
      WHERE gcr.gift_card_id = v_row.id AND gcr.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR (
      v_row.tenant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_tenant_roles utr
        WHERE utr.user_id = auth.uid() AND utr.is_active AND utr.tenant_id = v_row.tenant_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this gift card';
  END IF;

  RETURN QUERY
  SELECT v_row.id, v_row.balance, v_row.currency, v_row.is_active, v_row.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_gift_card_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_gift_card_by_code(text) TO authenticated;
