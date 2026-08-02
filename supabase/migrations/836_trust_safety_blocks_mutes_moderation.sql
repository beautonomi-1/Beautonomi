-- ============================================================================
-- Migration 836: User blocks/mutes + moderation columns for trust & safety
-- ============================================================================

-- user_blocks — peer block (bidirectional enforcement in API)
CREATE TABLE IF NOT EXISTS public.user_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    reason TEXT CHECK (reason IS NULL OR reason IN ('harassment', 'spam', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_blocks_not_self CHECK (blocker_id != blocked_user_id),
    CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_tenant ON public.user_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_pair ON public.user_blocks(blocker_id, blocked_user_id);

COMMENT ON TABLE public.user_blocks IS
  'Peer blocks: blocker cannot interact with blocked user; enforced server-side on messaging and explore.';

DROP TRIGGER IF EXISTS user_blocks_updated_at ON public.user_blocks;
CREATE TRIGGER user_blocks_updated_at
    BEFORE UPDATE ON public.user_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own blocks" ON public.user_blocks;
CREATE POLICY "Users can view own blocks"
    ON public.user_blocks FOR SELECT
    USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own blocks" ON public.user_blocks;
CREATE POLICY "Users can create own blocks"
    ON public.user_blocks FOR INSERT
    WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own blocks" ON public.user_blocks;
CREATE POLICY "Users can delete own blocks"
    ON public.user_blocks FOR DELETE
    USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Superadmin can view all blocks" ON public.user_blocks;
CREATE POLICY "Superadmin can view all blocks"
    ON public.user_blocks FOR SELECT
    USING (
        blocker_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
    );

-- user_mutes — softer hide (content/notifications); does not block DMs alone
CREATE TABLE IF NOT EXISTS public.user_mutes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    muter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    muted_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_mutes_not_self CHECK (muter_id != muted_user_id),
    CONSTRAINT user_mutes_unique_pair UNIQUE (muter_id, muted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_mutes_muter ON public.user_mutes(muter_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_muted ON public.user_mutes(muted_user_id);
CREATE INDEX IF NOT EXISTS idx_user_mutes_tenant ON public.user_mutes(tenant_id);

COMMENT ON TABLE public.user_mutes IS
  'Peer mutes: muter hides muted user content and notifications; softer than user_blocks.';

DROP TRIGGER IF EXISTS user_mutes_updated_at ON public.user_mutes;
CREATE TRIGGER user_mutes_updated_at
    BEFORE UPDATE ON public.user_mutes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mutes" ON public.user_mutes;
CREATE POLICY "Users can view own mutes"
    ON public.user_mutes FOR SELECT
    USING (muter_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own mutes" ON public.user_mutes;
CREATE POLICY "Users can create own mutes"
    ON public.user_mutes FOR INSERT
    WITH CHECK (muter_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own mutes" ON public.user_mutes;
CREATE POLICY "Users can delete own mutes"
    ON public.user_mutes FOR DELETE
    USING (muter_id = auth.uid());

DROP POLICY IF EXISTS "Superadmin can view all mutes" ON public.user_mutes;
CREATE POLICY "Superadmin can view all mutes"
    ON public.user_mutes FOR SELECT
    USING (
        muter_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
    );

-- explore_comments moderation columns
ALTER TABLE public.explore_comments
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderation_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_explore_comments_hidden ON public.explore_comments(post_id, is_hidden)
    WHERE is_hidden = false;

-- messages moderation columns
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS moderation_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_hidden ON public.messages(conversation_id, is_hidden)
    WHERE is_hidden = false;

-- content_reports admin action tracking
ALTER TABLE public.content_reports
    ADD COLUMN IF NOT EXISTS admin_action_taken TEXT,
    ADD COLUMN IF NOT EXISTS takedown_applied BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.content_reports.admin_action_taken IS
  'Free-text record of moderation action taken when resolving the report.';
COMMENT ON COLUMN public.content_reports.takedown_applied IS
  'True when resolve flow applied hide/delete on the reported target.';

-- Update 13-17 restricted defaults: disable DMs for teens
UPDATE public.feature_flags
SET metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{disable_direct_messaging}',
    'true'::jsonb,
    true
),
updated_at = NOW()
WHERE feature_key = 'safety.restricted_mode_defaults'
  AND tenant_id IS NULL
  AND (metadata->>'disable_direct_messaging') IS DISTINCT FROM 'true';

INSERT INTO public.feature_flags (
  feature_key, feature_name, description, enabled, category, metadata
)
VALUES (
  'safety.auto_hide_report_threshold',
  'Auto-hide reported content',
  'When enabled, auto-hide UGC targets that receive 3+ pending reports within 24 hours.',
  false,
  'control_plane',
  '{"threshold": 3, "window_hours": 24}'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;
