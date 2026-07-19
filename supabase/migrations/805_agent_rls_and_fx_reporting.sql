-- 805: Complete agent workforce RLS (798 gaps) + FX reporting_amount conversion helper.

BEGIN;

-- ─── agent_eval_outcomes: enable RLS (was missing in 798) ───────────────────
ALTER TABLE public.agent_eval_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_eval_outcomes_superadmin ON public.agent_eval_outcomes;
CREATE POLICY agent_eval_outcomes_superadmin ON public.agent_eval_outcomes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

-- ─── Unpoliced agent tables from 798 ─────────────────────────────────────────
DROP POLICY IF EXISTS agent_definitions_superadmin ON public.agent_definitions;
CREATE POLICY agent_definitions_superadmin ON public.agent_definitions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS agent_definition_versions_superadmin ON public.agent_definition_versions;
CREATE POLICY agent_definition_versions_superadmin ON public.agent_definition_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS agent_tool_grants_superadmin ON public.agent_tool_grants;
CREATE POLICY agent_tool_grants_superadmin ON public.agent_tool_grants
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS agent_operational_state_superadmin ON public.agent_operational_state;
CREATE POLICY agent_operational_state_superadmin ON public.agent_operational_state
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS agent_emergency_controls_superadmin ON public.agent_emergency_controls;
CREATE POLICY agent_emergency_controls_superadmin ON public.agent_emergency_controls
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin'));

DROP POLICY IF EXISTS agent_runs_tenant_read ON public.agent_runs;
CREATE POLICY agent_runs_tenant_read ON public.agent_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.user_tenant_roles utr
      WHERE utr.user_id = auth.uid() AND utr.tenant_id = agent_runs.tenant_id AND utr.is_active
    )
  );

DROP POLICY IF EXISTS agent_steps_run_read ON public.agent_steps;
CREATE POLICY agent_steps_run_read ON public.agent_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.agent_runs ar
      JOIN public.user_tenant_roles utr ON utr.tenant_id = ar.tenant_id AND utr.user_id = auth.uid() AND utr.is_active
      WHERE ar.id = agent_steps.run_id
    )
  );

DROP POLICY IF EXISTS agent_action_approval_requirements_tenant ON public.agent_action_approval_requirements;
CREATE POLICY agent_action_approval_requirements_tenant ON public.agent_action_approval_requirements
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.agent_actions aa
      JOIN public.user_tenant_roles utr ON utr.tenant_id = aa.tenant_id AND utr.user_id = auth.uid() AND utr.is_active
      WHERE aa.id = agent_action_approval_requirements.action_id
    )
  );

DROP POLICY IF EXISTS agent_action_approvals_tenant ON public.agent_action_approvals;
CREATE POLICY agent_action_approvals_tenant ON public.agent_action_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.agent_action_approval_requirements req
      JOIN public.agent_actions aa ON aa.id = req.action_id
      JOIN public.user_tenant_roles utr ON utr.tenant_id = aa.tenant_id AND utr.user_id = auth.uid() AND utr.is_active
      WHERE req.id = agent_action_approvals.requirement_id
    )
  );

DROP POLICY IF EXISTS agent_action_evidence_tenant ON public.agent_action_evidence;
CREATE POLICY agent_action_evidence_tenant ON public.agent_action_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'superadmin')
    OR EXISTS (
      SELECT 1 FROM public.agent_actions aa
      JOIN public.user_tenant_roles utr ON utr.tenant_id = aa.tenant_id AND utr.user_id = auth.uid() AND utr.is_active
      WHERE aa.id = agent_action_evidence.action_id
    )
  );

-- Runtime writes remain service_role only (no authenticated INSERT/UPDATE policies).

-- ─── FX reporting helper ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convert_to_reporting_amount(
  p_raw_amount numeric,
  p_raw_currency text,
  p_reporting_currency text,
  p_rate_date date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw text := upper(trim(coalesce(p_raw_currency, 'ZAR')));
  v_reporting text := upper(trim(coalesce(p_reporting_currency, 'ZAR')));
  v_rate numeric;
BEGIN
  IF p_raw_amount IS NULL THEN RETURN NULL; END IF;
  IF v_raw = v_reporting THEN RETURN p_raw_amount; END IF;

  SELECT fr.rate INTO v_rate
  FROM public.fx_reference_rates fr
  WHERE fr.base_currency = v_raw
    AND fr.quote_currency = v_reporting
    AND fr.rate_date <= p_rate_date
  ORDER BY fr.rate_date DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'missing_fx_rate:%->% on %', v_raw, v_reporting, p_rate_date;
  END IF;

  RETURN round(p_raw_amount * v_rate, 4);
END;
$$;

COMMENT ON FUNCTION public.convert_to_reporting_amount IS
  'Convert raw ledger amounts to tenant reporting currency via fx_reference_rates (reporting only).';

COMMIT;
