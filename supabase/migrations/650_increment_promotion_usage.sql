-- 650: Atomic promotion usage counter
--
-- Promotion usage_count was incremented with a read-modify-write only on the
-- Paystack webhook path, so concurrent redemptions could exceed usage_limit and
-- wallet/gift/cash bookings never counted at all (codes effectively reusable).
-- This RPC performs an atomic increment so every payment path can record usage
-- consistently via the shared recordPromotionUsage() helper.

CREATE OR REPLACE FUNCTION public.increment_promotion_usage(p_promotion_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.promotions
  SET usage_count = COALESCE(usage_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_promotion_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.increment_promotion_usage(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_promotion_usage(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_promotion_usage(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_promotion_usage(UUID) TO authenticated;
