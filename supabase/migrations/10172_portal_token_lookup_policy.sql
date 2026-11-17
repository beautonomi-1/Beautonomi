-- The policy named for a token lookup does not compare the token. It lets
-- every signed-in session read every active, unexpired portal token.
-- Validation uses the portal-token function through the service role, and
-- a new link is stored the same way. Drop that policy. A provider can
-- still read a token for a booking they own.

DROP POLICY IF EXISTS "Portal tokens can be read by token value" ON public.portal_tokens;
