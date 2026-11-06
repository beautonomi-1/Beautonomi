-- 10125: A membership refund writes a membership_provider_earnings refund (the provider's
--        share) and a membership_sale refund (the gross sale). Only the first is a provider
--        deduction; exclude membership_sale so this RPC matches NON_PROVIDER_REFUND_COMPONENTS.

BEGIN;

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
              'gift_card_liability_reduction', 'membership_sale',
              'additional_charge_payment', 'cashback'
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
