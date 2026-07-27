-- ============================================================================
-- Migration 828: Age assurance safety settings + content reports + feature flags
-- ============================================================================

-- Per-user content & safety controls (restricted mode, social toggles, etc.)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS safety_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.safety_settings IS
  'Content & safety controls: restricted_mode, hide_social_feed, disable_comments_likes, disable_direct_messaging, sensitive_content_filter, require_device_auth. Locked keys enforced server-side for 13-17 band.';

-- Optional device age signal (Phase 3 Declared Age Range adapter)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS device_age_lower_bound INTEGER,
  ADD COLUMN IF NOT EXISTS device_age_signal_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.device_age_lower_bound IS
  'Lower bound of device-declared age range (Apple/Google). Lowest-precedence age signal; never overrides verified KYC DOB.';

-- ============================================================================
-- content_reports — UGC target reporting (separate from user_reports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN (
        'explore_post', 'explore_comment', 'message', 'review', 'product_review'
    )),
    target_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN (
        'inappropriate', 'misleading', 'harassment', 'spam', 'safety', 'other'
    )),
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    tenant_id UUID REFERENCES public.tenants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT content_reports_details_not_empty CHECK (
        details IS NULL OR length(trim(details)) > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON public.content_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_target ON public.content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON public.content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_created ON public.content_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_tenant_id ON public.content_reports(tenant_id);

COMMENT ON TABLE public.content_reports IS
  'Reports on UGC targets (explore posts, comments, messages, reviews). Resolved by superadmin.';

DROP TRIGGER IF EXISTS content_reports_updated_at ON public.content_reports;
CREATE TRIGGER content_reports_updated_at
    BEFORE UPDATE ON public.content_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content reports"
    ON public.content_reports FOR SELECT
    USING (
        reporter_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
    );

CREATE POLICY "Users can create content reports"
    ON public.content_reports FOR INSERT
    WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Superadmin can update content reports"
    ON public.content_reports FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin')
    );

-- ============================================================================
-- Feature flags — safety / age assurance (seeded log mode = no enforcement yet)
-- ============================================================================

INSERT INTO public.feature_flags (
  feature_key, feature_name, description, enabled, category, metadata
)
VALUES (
  'safety.social_min_age',
  'Social minimum age',
  'Minimum age (years) for social/UGC capabilities. Users below this age are blocked when enforcement is active.',
  true,
  'control_plane',
  '{"min_age": 13}'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.feature_flags (
  feature_key, feature_name, description, enabled, category, metadata
)
VALUES (
  'safety.social_age_gate_mode',
  'Social age gate mode',
  'Controls server-side social access enforcement: off (disabled), log (audit only), enforce (block).',
  true,
  'control_plane',
  '{"mode": "log"}'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;

INSERT INTO public.feature_flags (
  feature_key, feature_name, description, enabled, category, metadata
)
VALUES (
  'safety.restricted_mode_defaults',
  'Restricted mode defaults (13-17)',
  'Default safety settings forced on for users in the 13-17 age band.',
  true,
  'control_plane',
  '{
    "restricted_mode": true,
    "hide_social_feed": true,
    "disable_comments_likes": true,
    "disable_direct_messaging": false,
    "sensitive_content_filter": true,
    "require_device_auth": true
  }'::jsonb
)
ON CONFLICT (feature_key) WHERE tenant_id IS NULL DO NOTHING;
