-- Finance audit: wallet_credit_self allowed any authenticated user to mint balance.
-- All legitimate credits use wallet_credit_admin (service role) or narrow server paths.

REVOKE EXECUTE ON FUNCTION public.wallet_credit_self(NUMERIC, TEXT, UUID, TEXT, UUID) FROM authenticated;
