-- Only the server (service_role) may change wallet top-up amount/status after insert.

DROP POLICY IF EXISTS "Users can update own pending wallet topups" ON public.wallet_topups;
