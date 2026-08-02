-- ============================================================================
-- Migration 838: Allow users to read inbound blocks (blocked_user_id = self)
-- Enables bidirectional block visibility via user JWT for getBlockedUserIds().
-- ============================================================================

DROP POLICY IF EXISTS "Users can view blocks against them" ON public.user_blocks;

CREATE POLICY "Users can view blocks against them"
    ON public.user_blocks FOR SELECT
    USING (blocked_user_id = auth.uid());

COMMENT ON POLICY "Users can view blocks against them" ON public.user_blocks IS
  'Lets a user see rows where someone else blocked them (inbound blocks).';
