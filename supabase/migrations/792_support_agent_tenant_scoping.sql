-- Phase 10: Tenant-scoped support_agent access (fix global ticket visibility).

DROP POLICY IF EXISTS "Users can view their own tickets" ON public.support_tickets;

CREATE POLICY support_tickets_select_scoped
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'support_agent'
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_tenant_roles utr
        INNER JOIN public.providers p ON p.tenant_id = utr.tenant_id
        WHERE utr.user_id = auth.uid()
          AND utr.is_active = true
          AND (
            support_tickets.provider_id = p.id
            OR support_tickets.user_id IN (
              SELECT u2.id FROM public.users u2
              WHERE u2.preferred_home_tenant_id = utr.tenant_id
            )
          )
      )
    )
  );

COMMENT ON POLICY support_tickets_select_scoped ON public.support_tickets IS
  'P10: support_agent sees tickets only in assigned tenant region(s); superadmin global.';

-- ── Helper: is the current user allowed to touch this ticket? ────────────────
-- Mirrors support_tickets_select_scoped so messages/notes inherit the same
-- tenant scoping for support_agent (superadmin remains global).
CREATE OR REPLACE FUNCTION public.support_agent_can_access_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_tickets st
    WHERE st.id = p_ticket_id
      AND (
        st.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid() AND u.role = 'superadmin'
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'support_agent'
          )
          AND EXISTS (
            SELECT 1
            FROM public.user_tenant_roles utr
            INNER JOIN public.providers p ON p.tenant_id = utr.tenant_id
            WHERE utr.user_id = auth.uid()
              AND utr.is_active = true
              AND (
                st.provider_id = p.id
                OR st.user_id IN (
                  SELECT u2.id FROM public.users u2
                  WHERE u2.preferred_home_tenant_id = utr.tenant_id
                )
              )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.support_agent_can_access_ticket(uuid) TO authenticated;

-- ── support_ticket_messages: tenant-scoped for support_agent ────────────────
DROP POLICY IF EXISTS "Users can view messages for their tickets" ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_select_scoped
  ON public.support_ticket_messages
  FOR SELECT
  TO authenticated
  USING (public.support_agent_can_access_ticket(ticket_id));

DROP POLICY IF EXISTS "Users can create messages for their tickets" ON public.support_ticket_messages;
CREATE POLICY support_ticket_messages_insert_scoped
  ON public.support_ticket_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.support_agent_can_access_ticket(ticket_id));

-- ── support_ticket_notes: internal notes, tenant-scoped for support_agent ───
DROP POLICY IF EXISTS "Support agents and admins can view notes" ON public.support_ticket_notes;
CREATE POLICY support_ticket_notes_select_scoped
  ON public.support_ticket_notes
  FOR SELECT
  TO authenticated
  USING (public.support_agent_can_access_ticket(ticket_id));

DROP POLICY IF EXISTS "Support agents and admins can create notes" ON public.support_ticket_notes;
CREATE POLICY support_ticket_notes_insert_scoped
  ON public.support_ticket_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.support_agent_can_access_ticket(ticket_id));

COMMENT ON FUNCTION public.support_agent_can_access_ticket(uuid) IS
  'P10: single source of truth for support ticket child-row access; enforces tenant scoping for support_agent.';
