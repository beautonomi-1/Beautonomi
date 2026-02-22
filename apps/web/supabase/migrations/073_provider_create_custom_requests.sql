-- Beautonomi Database Migration
-- 073_provider_create_custom_requests.sql
-- Allow providers to create custom requests (for sending proactive offers to clients)

-- Allow providers/staff to create custom requests for their provider
CREATE POLICY "Providers can create custom requests for their provider"
  ON custom_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = custom_requests.provider_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );

-- Allow providers/staff to update custom requests for their provider (to update status, etc.)
CREATE POLICY "Providers can update custom requests for their provider"
  ON custom_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = custom_requests.provider_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers p
      WHERE p.id = custom_requests.provider_id
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM provider_staff ps
          WHERE ps.provider_id = p.id AND ps.user_id = auth.uid()
        )
      )
    )
  );
