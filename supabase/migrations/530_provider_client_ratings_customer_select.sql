-- Allow customers to read their own provider→client booking ratings so
-- `/api/me/rating` and profile summary can aggregate without service_role.

DROP POLICY IF EXISTS "Customers can select own provider client ratings" ON public.provider_client_ratings;

CREATE POLICY "Customers can select own provider client ratings"
  ON public.provider_client_ratings
  FOR SELECT
  USING (customer_id = auth.uid());
