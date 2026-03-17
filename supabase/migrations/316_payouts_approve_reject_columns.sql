-- Add columns used by admin approve/reject payout routes (audit trail).
-- All nullable so existing rows and flows are unchanged.

ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN payouts.approved_by IS 'Admin user who approved the payout';
COMMENT ON COLUMN payouts.approved_at IS 'When the payout was approved';
COMMENT ON COLUMN payouts.admin_notes IS 'Admin notes on approve/reject';
COMMENT ON COLUMN payouts.rejected_by IS 'Admin user who rejected the payout';
COMMENT ON COLUMN payouts.rejected_at IS 'When the payout was rejected';
