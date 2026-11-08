-- Scope RLS policies that call helper functions (is_provider_staff/is_provider_owner)
-- to authenticated roles only.
--
-- Why:
-- - These policies were created without a `TO ...` clause, so they applied to anon too.
-- - Postgres RLS combines policies with OR, but evaluation is not guaranteed to short-circuit.
-- - For anon requests, this could still invoke helper functions and error with:
--     42501 permission denied for function is_provider_staff
--   which breaks public endpoints that indirectly touch `providers` via RLS checks.
--
-- Keep public read policies broad; restrict only the policies that require auth context.

-- providers
ALTER POLICY "Providers can view own profile" ON public.providers TO authenticated, service_role;
ALTER POLICY "Providers can update own profile" ON public.providers TO authenticated, service_role;
ALTER POLICY "Staff can view provider profile" ON public.providers TO authenticated, service_role;
ALTER POLICY "Superadmins can manage all providers" ON public.providers TO authenticated, service_role;

-- provider_staff
ALTER POLICY "Providers can manage own staff" ON public.provider_staff TO authenticated, service_role;
ALTER POLICY "Staff can view own profile" ON public.provider_staff TO authenticated, service_role;
ALTER POLICY "Superadmins can manage all staff" ON public.provider_staff TO authenticated, service_role;

-- provider_locations
ALTER POLICY "Providers can manage own locations" ON public.provider_locations TO authenticated, service_role;
ALTER POLICY "Staff can view provider locations" ON public.provider_locations TO authenticated, service_role;
ALTER POLICY "Superadmins can manage all locations" ON public.provider_locations TO authenticated, service_role;

-- service_zones
ALTER POLICY "Providers can manage own service zones" ON public.service_zones TO authenticated, service_role;
ALTER POLICY "Staff can view service zones" ON public.service_zones TO authenticated, service_role;
ALTER POLICY "Superadmins can manage all service zones" ON public.service_zones TO authenticated, service_role;

-- provider_subscriptions
ALTER POLICY "Providers can view own subscription" ON public.provider_subscriptions TO authenticated, service_role;
ALTER POLICY "Staff can view provider subscription" ON public.provider_subscriptions TO authenticated, service_role;
ALTER POLICY "Superadmins can manage all subscriptions" ON public.provider_subscriptions TO authenticated, service_role;

