-- Beautonomi Database Migration
-- 113_update_support_ticket_policies_for_support_agent.sql
-- Updates RLS policies to include support_agent role
-- 
-- This runs AFTER migration 112, so the enum value is already committed

-- Drop and recreate support_tickets policies
DROP POLICY IF EXISTS "Users can view their own tickets" ON support_tickets;
CREATE POLICY "Users can view their own tickets"
  ON support_tickets FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'support_agent')
    )
  );

DROP POLICY IF EXISTS "Support agents and admins can update tickets" ON support_tickets;
CREATE POLICY "Support agents and admins can update tickets"
  ON support_tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'support_agent')
    )
  );

-- Drop and recreate support_ticket_messages policies
DROP POLICY IF EXISTS "Users can view messages for their tickets" ON support_ticket_messages;
CREATE POLICY "Users can view messages for their tickets"
  ON support_ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_ticket_messages.ticket_id
      AND (support_tickets.user_id = auth.uid() OR
           EXISTS (
             SELECT 1 FROM users
             WHERE users.id = auth.uid()
             AND users.role IN ('superadmin', 'support_agent')
           ))
    )
  );

DROP POLICY IF EXISTS "Users can create messages for their tickets" ON support_ticket_messages;
CREATE POLICY "Users can create messages for their tickets"
  ON support_ticket_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_ticket_messages.ticket_id
      AND (support_tickets.user_id = auth.uid() OR
           EXISTS (
             SELECT 1 FROM users
             WHERE users.id = auth.uid()
             AND users.role IN ('superadmin', 'support_agent')
           ))
    )
  );

-- Drop and recreate support_ticket_notes policies
DROP POLICY IF EXISTS "Support agents and admins can view notes" ON support_ticket_notes;
CREATE POLICY "Support agents and admins can view notes"
  ON support_ticket_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'support_agent')
    )
  );

DROP POLICY IF EXISTS "Support agents and admins can create notes" ON support_ticket_notes;
CREATE POLICY "Support agents and admins can create notes"
  ON support_ticket_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('superadmin', 'support_agent')
    )
  );
