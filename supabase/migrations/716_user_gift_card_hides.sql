-- Migration 716: Per-user gift card hides
--
-- Gift cards are shared financial ledger objects (no per-user FK on gift_cards).
-- This table lets a customer hide a depleted/expired card from their own wallet
-- without touching the underlying gift_cards row (which may still be needed for
-- audit, receipts, and finance reconciliation).
--
-- The GET /api/me/gift-cards route filters out hidden IDs after computing the
-- candidate set. The DELETE /api/me/gift-cards/[id] route inserts a row here.

CREATE TABLE IF NOT EXISTS user_gift_card_hides (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_card_id  UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  hidden_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, gift_card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_gift_card_hides_user ON user_gift_card_hides(user_id);

ALTER TABLE user_gift_card_hides ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own hide entries.
CREATE POLICY "Users can manage own gift card hides"
  ON user_gift_card_hides
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE user_gift_card_hides IS
  'Per-user wallet visibility: rows here suppress a gift card from appearing in GET /api/me/gift-cards. Does not modify the underlying gift_cards record.';
