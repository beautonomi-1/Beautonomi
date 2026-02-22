-- ============================================================================
-- Migration 226: User reports (customer report provider, provider report customer)
-- ============================================================================
-- Resolved by superadmin. Customers can report providers; providers can report customers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL CHECK (report_type IN ('customer_reported_provider', 'provider_reported_customer')),
    description TEXT NOT NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_reports_not_self CHECK (reporter_id != reported_user_id),
    CONSTRAINT user_reports_description_not_empty CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_created ON user_reports(created_at DESC);

COMMENT ON TABLE user_reports IS 'Reports from customers about providers or from providers about customers. Resolved by superadmin.';

DROP TRIGGER IF EXISTS user_reports_updated_at ON user_reports;
CREATE TRIGGER user_reports_updated_at
    BEFORE UPDATE ON user_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- Reporter can view their own reports
CREATE POLICY "Users can view own reports"
    ON user_reports FOR SELECT
    USING (reporter_id = auth.uid());

-- Authenticated users can insert (enforced in API: customer can report provider, provider can report customer)
CREATE POLICY "Users can create reports"
    ON user_reports FOR INSERT
    WITH CHECK (reporter_id = auth.uid());

-- Only superadmin can update (resolve/dismiss)
CREATE POLICY "Superadmin can update reports"
    ON user_reports FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    );

-- Superadmin can view all
CREATE POLICY "Superadmin can view all reports"
    ON user_reports FOR SELECT
    USING (
        reporter_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'superadmin')
    );
