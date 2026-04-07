-- Prepaid package sessions/credits for customers (optional redemption on online booking).

CREATE TABLE IF NOT EXISTS public.customer_package_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
    sessions_remaining INTEGER NOT NULL CHECK (sessions_remaining >= 0),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpe_customer ON public.customer_package_entitlements(customer_id);
CREATE INDEX IF NOT EXISTS idx_cpe_provider_package ON public.customer_package_entitlements(provider_id, package_id);

COMMENT ON TABLE public.customer_package_entitlements IS
  'Customer-owned package sessions; redeeming an online booking decrements sessions_remaining. Populated by commerce/admin flows — not created by this migration.';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_package_entitlement_id UUID REFERENCES public.customer_package_entitlements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.customer_package_entitlement_id IS
  'When set, this booking redeemed one session from this entitlement (see redeem_customer_package_entitlement).';

ALTER TABLE public.customer_package_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_package_entitlements_select_own"
  ON public.customer_package_entitlements
  FOR SELECT
  USING (customer_id = auth.uid());

-- API uses service role / SECURITY DEFINER for updates.

CREATE OR REPLACE FUNCTION public.redeem_customer_package_entitlement(
  p_entitlement_id UUID,
  p_customer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.customer_package_entitlements
  SET
    sessions_remaining = sessions_remaining - 1,
    updated_at = NOW()
  WHERE id = p_entitlement_id
    AND customer_id = p_customer_id
    AND sessions_remaining > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_customer_package_entitlement(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_customer_package_entitlement(UUID, UUID) TO service_role;
