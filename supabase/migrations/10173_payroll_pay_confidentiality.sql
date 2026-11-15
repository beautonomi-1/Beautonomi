-- Pay lines and pay plans were readable by every staff login, and in some
-- cases by any signed-in session, because the broad policies and missing
-- row security covered the whole salon. The payroll API uses the service
-- role and still checks payroll access. A direct read now sees only the
-- caller's own line, or every line when they own that salon.

DROP POLICY IF EXISTS "Providers can view own pay run items" ON public.provider_pay_run_items;

DROP POLICY IF EXISTS "Providers can view own pay runs" ON public.provider_pay_runs;

CREATE POLICY pay_runs_owner_read ON public.provider_pay_runs
  FOR SELECT TO authenticated
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

CREATE POLICY pay_runs_own_line_read ON public.provider_pay_runs
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT pri.pay_run_id
      FROM public.provider_pay_run_items pri
      JOIN public.provider_staff ps ON ps.id = pri.staff_id
      WHERE ps.user_id = auth.uid()
        AND ps.deleted_at IS NULL
    )
  );

ALTER TABLE public.staff_pay_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_service_rate_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_pay_run_item_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_pay_plans_owner_all ON public.staff_pay_plans;
CREATE POLICY staff_pay_plans_owner_all ON public.staff_pay_plans
  FOR ALL TO authenticated
  USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS staff_pay_plans_self_read ON public.staff_pay_plans;
CREATE POLICY staff_pay_plans_self_read ON public.staff_pay_plans
  FOR SELECT TO authenticated
  USING (
    staff_id IN (
      SELECT id FROM public.provider_staff
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS staff_rate_overrides_owner_all ON public.staff_service_rate_overrides;
CREATE POLICY staff_rate_overrides_owner_all ON public.staff_service_rate_overrides
  FOR ALL TO authenticated
  USING (
    staff_id IN (
      SELECT ps.id
      FROM public.provider_staff ps
      JOIN public.providers p ON p.id = ps.provider_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    staff_id IN (
      SELECT ps.id
      FROM public.provider_staff ps
      JOIN public.providers p ON p.id = ps.provider_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staff_rate_overrides_self_read ON public.staff_service_rate_overrides;
CREATE POLICY staff_rate_overrides_self_read ON public.staff_service_rate_overrides
  FOR SELECT TO authenticated
  USING (
    staff_id IN (
      SELECT id FROM public.provider_staff
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS pay_run_item_lines_owner_read ON public.provider_pay_run_item_lines;
CREATE POLICY pay_run_item_lines_owner_read ON public.provider_pay_run_item_lines
  FOR SELECT TO authenticated
  USING (
    pay_run_item_id IN (
      SELECT pri.id
      FROM public.provider_pay_run_items pri
      JOIN public.provider_pay_runs pr ON pr.id = pri.pay_run_id
      WHERE pr.provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS pay_run_item_lines_self_read ON public.provider_pay_run_item_lines;
CREATE POLICY pay_run_item_lines_self_read ON public.provider_pay_run_item_lines
  FOR SELECT TO authenticated
  USING (
    pay_run_item_id IN (
      SELECT pri.id
      FROM public.provider_pay_run_items pri
      JOIN public.provider_staff ps ON ps.id = pri.staff_id
      WHERE ps.user_id = auth.uid() AND ps.deleted_at IS NULL
    )
  );
