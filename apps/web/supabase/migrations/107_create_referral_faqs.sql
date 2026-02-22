-- Beautonomi Database Migration
-- 107_create_referral_faqs.sql
-- Creates table for managing referral program FAQs

CREATE TABLE IF NOT EXISTS referral_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT, -- For text-type answers
  answer_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (answer_type IN ('text', 'list')),
  answer_list JSONB, -- For list-type answers (array of strings)
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_referral_faqs_display_order ON referral_faqs(display_order, created_at);
CREATE INDEX IF NOT EXISTS idx_referral_faqs_active ON referral_faqs(is_active) WHERE is_active = true;

-- Create trigger for updated_at
CREATE TRIGGER update_referral_faqs_updated_at
BEFORE UPDATE ON referral_faqs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE referral_faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can view active FAQs
CREATE POLICY "Public can view active referral FAQs"
  ON referral_faqs FOR SELECT
  USING (is_active = true);

-- Superadmins can manage all FAQs
CREATE POLICY "Superadmins can manage referral FAQs"
  ON referral_faqs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'superadmin'
    )
  );

-- Insert default FAQs
INSERT INTO referral_faqs (question, answer, answer_type, display_order, is_active) VALUES
  ('How does the referral program work?', 'Share your unique referral link with friends and family. When someone signs up using your link and completes their first booking, you both earn rewards. Your referral must complete a booking to qualify for rewards. Rewards are credited to your wallet after the referred user''s first completed booking.', 'text', 0, true),
  ('How much can I earn from referrals?', 'You earn rewards for each successful referral. The amount may vary based on current promotions. Check your referral dashboard for the latest reward amounts.', 'text', 1, true),
  ('When do I receive my referral rewards?', 'You receive your referral reward after the person you referred completes their first booking on Beautonomi. The reward is credited to your wallet and can be used for future bookings or withdrawn according to our payout policy.', 'text', 2, true),
  ('Can I refer the same person multiple times?', 'No, each person can only be referred once. If someone has already signed up for Beautonomi, they cannot use your referral link to earn rewards.', 'text', 3, true),
  ('How do I track my referrals?', 'You can track all your referrals, earnings, and pending rewards on this page. The dashboard shows your total referrals, successful referrals, and total earnings.', 'text', 4, true)
ON CONFLICT DO NOTHING;
