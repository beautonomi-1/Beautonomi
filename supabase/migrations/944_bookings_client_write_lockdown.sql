-- Phase 1b: remove direct client INSERT/UPDATE on bookings (writes go via service-role API / SECURITY DEFINER RPCs).

DROP POLICY IF EXISTS "Customers can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Providers can update own provider bookings" ON public.bookings;
DROP POLICY IF EXISTS "Customers can create own bookings" ON public.bookings;
