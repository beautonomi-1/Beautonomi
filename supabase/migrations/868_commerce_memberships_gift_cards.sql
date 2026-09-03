-- 868: Commerce walk-in migration path, membership pause/freeze, gift card expiry backfill,
--      provider finance RPC membership earnings parity.

BEGIN;

-- Walk-in POS adapter: link migrated legacy sales rows to product_orders.
ALTER TABLE public.product_orders
  ADD COLUMN IF NOT EXISTS legacy_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_orders_legacy_sale_id
  ON public.product_orders(legacy_sale_id)
  WHERE legacy_sale_id IS NOT NULL;

COMMENT ON COLUMN public.product_orders.legacy_sale_id IS
  'Set when POST /api/provider/sales was adapted into a walk_in product_order (Part I migration path).';

-- Membership pause/freeze basics (Part J1).
ALTER TABLE public.user_memberships
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;

COMMENT ON COLUMN public.user_memberships.paused_until IS
  'When set and in the future, auto-renew is skipped and benefits may be frozen until this timestamp.';

DO $$
BEGIN
  ALTER TABLE public.user_memberships
    DROP CONSTRAINT IF EXISTS user_memberships_status_check;
  ALTER TABLE public.user_memberships
    ADD CONSTRAINT user_memberships_status_check
    CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'paused'));
END $$;

-- Gift card expiry backfill: default 36 months from issuance (Part J2).
UPDATE public.gift_cards
SET expires_at = created_at + INTERVAL '36 months',
    updated_at = now()
WHERE expires_at IS NULL
  AND created_at IS NOT NULL;

-- Provider finance summary: include membership_provider_earnings in recognized revenue.
CREATE OR REPLACE FUNCTION public.provider_finance_summary(
  p_provider_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT
      transaction_type,
      COALESCE(net, amount, 0)::numeric AS net,
      refund_component
    FROM public.finance_transactions
    WHERE provider_id = p_provider_id
      AND created_at >= p_from
      AND created_at <= p_to
  ),
  agg AS (
    SELECT
      COALESCE(SUM(net) FILTER (WHERE transaction_type = 'provider_earnings'), 0) AS service_earnings,
      COALESCE(SUM(net) FILTER (WHERE transaction_type = 'membership_provider_earnings'), 0) AS membership_earnings,
      COALESCE(SUM(net) FILTER (WHERE transaction_type = 'tip'), 0) AS tips,
      COALESCE(SUM(net) FILTER (WHERE transaction_type = 'travel_fee'), 0) AS travel_fees,
      COALESCE(SUM(net) FILTER (WHERE transaction_type = 'cancellation_fee'), 0) AS cancellation_fees,
      COALESCE(SUM(net) FILTER (WHERE transaction_type = 'walk_in_additional_charge'), 0) AS walk_in_additional_charges,
      COALESCE(SUM(ABS(net)) FILTER (
        WHERE transaction_type = 'refund'
          AND (
            refund_component IS NULL
            OR refund_component NOT IN (
              'platform_fee', 'service_fee', 'tax', 'payment',
              'promotion_discount', 'membership_discount', 'loyalty_redemption',
              'loyalty_discount', 'wallet_payment', 'gift_card_payment',
              'gift_card_liability_reduction', 'additional_charge_payment', 'cashback'
            )
          )
      ), 0) AS refund_deduction
    FROM scoped
  )
  SELECT jsonb_build_object(
    'serviceEarnings', service_earnings,
    'membershipEarnings', membership_earnings,
    'tips', tips,
    'travelFees', travel_fees,
    'cancellationFees', cancellation_fees,
    'walkInAdditionalCharges', walk_in_additional_charges,
    'recognizedRevenue',
      service_earnings + membership_earnings + tips + travel_fees + cancellation_fees + walk_in_additional_charges,
    'refundDeduction', refund_deduction,
    'netAfterRefunds',
      service_earnings + membership_earnings + tips + travel_fees + cancellation_fees + walk_in_additional_charges - refund_deduction
  )
  FROM agg;
$$;

REVOKE ALL ON FUNCTION public.provider_finance_summary(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_finance_summary(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.provider_finance_summary(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provider_finance_summary(uuid, timestamptz, timestamptz) TO service_role;

COMMIT;
